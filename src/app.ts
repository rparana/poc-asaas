import fastify, { type FastifyInstance } from 'fastify';
import { getDb } from './infra/db/mongo.js';
import { getRedisClient } from './infra/redis/client.js';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: {
      level: 'info',
    },
  });

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

  return app;
}
