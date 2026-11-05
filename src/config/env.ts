import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  MONGO_URI: z
    .string()
    .default('mongodb://localhost:27017/cinema?replicaSet=rs0&directConnection=true'),
  MONGO_DB_NAME: z.string().default('cinema'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
});

export const env = envSchema.parse(process.env);
