import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err);
    });
  }

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
