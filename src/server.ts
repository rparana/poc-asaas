import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closeMongo, connectMongo } from './infra/db/mongo.js';
import { closeRedis, getRedisClient } from './infra/redis/client.js';
import { sessionEventBus } from './infra/redis/session-event-bus.js';

async function main() {
  const app = buildApp();

  try {
    console.log('Connecting to MongoDB...');
    await connectMongo();
    console.log('MongoDB connected successfully.');

    console.log('Verifying Redis connection...');
    const redis = getRedisClient();
    await redis.ping();
    console.log('Redis connected successfully.');

    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 Server listening at http://${env.HOST}:${env.PORT}`);
  } catch (error) {
    app.log.error(error);
    await sessionEventBus.close();
    await closeMongo();
    await closeRedis();
    process.exit(1);
  }

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}. Gracefully shutting down...`);
      await app.close();
      await sessionEventBus.close();
      await closeMongo();
      await closeRedis();
      console.log('Clean shutdown completed.');
      process.exit(0);
    });
  }
}

main();
