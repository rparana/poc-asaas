import cors from '@fastify/cors';
import fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './domain/errors/seat-errors.js';
import { seatRoutes } from './http/routes/seat-routes.js';
import { getDb } from './infra/db/mongo.js';
import { getRedisClient } from './infra/redis/client.js';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: {
      level: 'info',
    },
  });

  // Habilita CORS para clientes locais e conexões cross-origin
  app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Global Error Handler
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'VALIDATION_ERROR',
        message: 'Dados de entrada inválidos.',
        issues: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.code,
        message: error.message,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      statusCode: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Ocorreu um erro interno no servidor.',
    });
  });

  // Rotas de Infraestrutura
  app.get('/health', async (_request, reply) => {
    let mongoStatus = 'down';
    let redisStatus = 'down';

    try {
      const db = getDb();
      await db.command({ ping: 1 });
      mongoStatus = 'up';
    } catch {
      mongoStatus = 'down';
    }

    try {
      const redis = getRedisClient();
      const pong = await redis.ping();
      if (pong === 'PONG') {
        redisStatus = 'up';
      }
    } catch {
      redisStatus = 'down';
    }

    const isHealthy = mongoStatus === 'up' && redisStatus === 'up';

    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'healthy' : 'unhealthy',
      version: '1.0.0-poc',
      timestamp: new Date().toISOString(),
      services: {
        mongo: mongoStatus,
        redis: redisStatus,
      },
    });
  });

  // Rotas de Domínio da Reserva de Cinema
  app.register(seatRoutes, { prefix: '/api/v1' });

  return app;
}
