import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ConfirmSeatUseCase } from '../../application/use-cases/confirm-seat.use-case.js';
import { HoldSeatUseCase } from '../../application/use-cases/hold-seat.use-case.js';
import { ListSeatsUseCase } from '../../application/use-cases/list-seats.use-case.js';
import { ReleaseSeatUseCase } from '../../application/use-cases/release-seat.use-case.js';

const sessionParamsSchema = z.object({
  sessionId: z.string().min(1, 'sessionId é obrigatório'),
});

const seatParamsSchema = z.object({
  sessionId: z.string().min(1, 'sessionId é obrigatório'),
  seatNumber: z.string().min(1, 'seatNumber é obrigatório'),
});

const holdBodySchema = z.object({
  cartId: z.string().min(1, 'cartId é obrigatório'),
  ttlSeconds: z.number().int().positive().optional(),
});

const actionBodySchema = z.object({
  cartId: z.string().min(1, 'cartId é obrigatório'),
});

export const seatRoutes: FastifyPluginAsync = async (fastify) => {
  const listSeatsUseCase = new ListSeatsUseCase();
  const holdSeatUseCase = new HoldSeatUseCase();
  const confirmSeatUseCase = new ConfirmSeatUseCase();
  const releaseSeatUseCase = new ReleaseSeatUseCase();

  // RF01: Listar assentos da sessão
  fastify.get('/sessions/:sessionId/seats', async (request, reply) => {
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const result = await listSeatsUseCase.execute(sessionId);
    return reply.status(200).send(result);
  });

  // RF02: Bloqueio temporário (Hold)
  fastify.post('/sessions/:sessionId/seats/:seatNumber/hold', async (request, reply) => {
    const { sessionId, seatNumber } = seatParamsSchema.parse(request.params);
    const { cartId, ttlSeconds } = holdBodySchema.parse(request.body);

    const seat = await holdSeatUseCase.execute({
      sessionId,
      seatNumber,
      cartId,
      ttlSeconds,
    });

    return reply.status(200).send({
      message: `Assento ${seatNumber} bloqueado temporariamente com sucesso.`,
      seat: {
        sessionId: seat.sessionId,
        seatNumber: seat.seatNumber,
        status: seat.status,
        cartId: seat.cartId,
        expiresAt: seat.expiresAt,
      },
    });
  });

  // RF03: Confirmação da Reserva
  fastify.post('/sessions/:sessionId/seats/:seatNumber/confirm', async (request, reply) => {
    const { sessionId, seatNumber } = seatParamsSchema.parse(request.params);
    const { cartId } = actionBodySchema.parse(request.body);

    const seat = await confirmSeatUseCase.execute({
      sessionId,
      seatNumber,
      cartId,
    });

    return reply.status(200).send({
      message: `Assento ${seatNumber} confirmado e reservado com sucesso.`,
      seat: {
        sessionId: seat.sessionId,
        seatNumber: seat.seatNumber,
        status: seat.status,
        cartId: seat.cartId,
        updatedAt: seat.updatedAt,
      },
    });
  });

  // RF04: Liberação Manual (Cancelamento)
  fastify.delete('/sessions/:sessionId/seats/:seatNumber/hold', async (request, reply) => {
    const { sessionId, seatNumber } = seatParamsSchema.parse(request.params);
    const { cartId } = actionBodySchema.parse(request.body);

    const seat = await releaseSeatUseCase.execute({
      sessionId,
      seatNumber,
      cartId,
    });

    return reply.status(200).send({
      message: `Assento ${seatNumber} liberado com sucesso.`,
      seat: {
        sessionId: seat.sessionId,
        seatNumber: seat.seatNumber,
        status: seat.status,
      },
    });
  });
};

