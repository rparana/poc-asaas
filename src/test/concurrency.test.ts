import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { closeMongo, connectMongo, getSessionSeatsCollection } from '../infra/db/mongo.js';
import { closeRedis, getRedisClient } from '../infra/redis/client.js';
import { sessionEventBus } from '../infra/redis/session-event-bus.js';

describe('Testes de Concorrência e Lock Distribuído', () => {
  const app = buildApp();
  const sessionId = 'sessao-cinema-101';
  const seatNumber = 'A10';
  const redisLockKey = `seat_lock:${sessionId}:${seatNumber}`;

  beforeAll(async () => {
    await connectMongo();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await sessionEventBus.close();
    await closeMongo();
    await closeRedis();
  });

  beforeEach(async () => {
    const collection = getSessionSeatsCollection();
    const redis = getRedisClient();

    // Limpa chave do Redis
    await redis.del(redisLockKey);

    // Reseta o assento de teste no MongoDB para AVAILABLE
    const now = new Date();
    await collection.updateOne(
      { sessionId, seatNumber },
      {
        $set: {
          status: 'AVAILABLE',
          cartId: null,
          expiresAt: null,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  });

  it('1. Deve lidar com 10 requisições simultâneas: exatamente 1 vence (201) e 9 sofrem conflito (409)', async () => {
    const totalRequests = 10;
    const requests = Array.from({ length: totalRequests }, (_, index) => {
      const cartId = `cart-concurrency-${index + 1}`;
      return app.inject({
        method: 'POST',
        url: `/api/v1/sessions/${sessionId}/seats/${seatNumber}/hold`,
        payload: { cartId },
      });
    });

    // Dispara as 10 requisições simultaneamente
    const responses = await Promise.all(requests);

    // Valida os status HTTP retornados
    const successResponses = responses.filter((res) => res.statusCode === 201);
    const conflictResponses = responses.filter((res) => res.statusCode === 409);

    expect(successResponses).toHaveLength(1);
    expect(conflictResponses).toHaveLength(9);

    // Identifica o cartId vencedor
    const winningBody = JSON.parse(successResponses[0].body);
    const winningCartId = winningBody.seat.cartId;
    expect(winningCartId).toBeDefined();

    // 2. Consulta o MongoDB e garante consistência do assento
    const collection = getSessionSeatsCollection();
    const seatInMongo = await collection.findOne({ sessionId, seatNumber });

    expect(seatInMongo).not.toBeNull();
    expect(seatInMongo?.status).toBe('HELD');
    expect(seatInMongo?.cartId).toBe(winningCartId);
    expect(seatInMongo?.expiresAt).not.toBeNull();

    // 3. Consulta o Redis e valida a chave com TTL ativo
    const redis = getRedisClient();
    const redisValue = await redis.get(redisLockKey);
    const redisTtl = await redis.ttl(redisLockKey);

    expect(redisValue).toBe(winningCartId);
    expect(redisTtl).toBeGreaterThan(0);
  });

  it('2. Deve permitir que uma nova requisição reserve o assento após liberação manual via DELETE', async () => {
    const cartAlpha = 'cart-alpha-123';
    const cartBeta = 'cart-beta-456';

    // 1. cartAlpha retém o assento
    const holdRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/seats/${seatNumber}/hold`,
      payload: { cartId: cartAlpha },
    });
    expect(holdRes.statusCode).toBe(201);

    // 2. cartAlpha cancela a reserva temporária (DELETE)
    const releaseRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/sessions/${sessionId}/seats/${seatNumber}/hold`,
      payload: { cartId: cartAlpha },
    });
    expect(releaseRes.statusCode).toBe(200);

    // 3. cartBeta tenta reservar o mesmo assento imediatamente
    const newHoldRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/seats/${seatNumber}/hold`,
      payload: { cartId: cartBeta },
    });
    expect(newHoldRes.statusCode).toBe(201);

    const body = JSON.parse(newHoldRes.body);
    expect(body.seat.status).toBe('HELD');
    expect(body.seat.cartId).toBe(cartBeta);

    // Valida no MongoDB e Redis que o novo dono é o cartBeta
    const collection = getSessionSeatsCollection();
    const seatInMongo = await collection.findOne({ sessionId, seatNumber });
    expect(seatInMongo?.cartId).toBe(cartBeta);

    const redis = getRedisClient();
    const redisValue = await redis.get(redisLockKey);
    expect(redisValue).toBe(cartBeta);
  });

  it('3. Deve permitir que uma nova requisição reserve o assento após a expiração natural do TTL', async () => {
    const cartTemp = 'cart-temp-expire';
    const cartNew = 'cart-new-after-expire';

    // 1. cartTemp retém o assento com TTL curto de 1 segundo
    const holdRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/seats/${seatNumber}/hold`,
      payload: { cartId: cartTemp, ttlSeconds: 1 },
    });
    expect(holdRes.statusCode).toBe(201);

    // 2. Aguarda a expiração real do TTL no Redis e janela temporal (1.2s)
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Valida que o Redis já expirou a chave
    const redis = getRedisClient();
    const expiredLock = await redis.get(redisLockKey);
    expect(expiredLock).toBeNull();

    // 3. cartNew tenta obter o assento cujo HELD expirou
    const newHoldRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/seats/${seatNumber}/hold`,
      payload: { cartId: cartNew },
    });
    expect(newHoldRes.statusCode).toBe(201);

    const body = JSON.parse(newHoldRes.body);
    expect(body.seat.cartId).toBe(cartNew);

    // Valida atualização atômica de assento expirado no MongoDB
    const collection = getSessionSeatsCollection();
    const seatInMongo = await collection.findOne({ sessionId, seatNumber });
    expect(seatInMongo?.status).toBe('HELD');
    expect(seatInMongo?.cartId).toBe(cartNew);
  });
});
