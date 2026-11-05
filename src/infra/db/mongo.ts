import { type Collection, type Db, MongoClient } from 'mongodb';
import { env } from '../../config/env.js';
import type { SessionSeat } from './models/session-seat.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export const SESSION_SEATS_COLLECTION = 'session_seats';

export async function connectMongo(): Promise<Db> {
  if (db && client) {
    return db;
  }

  client = new MongoClient(env.MONGO_URI);
  await client.connect();
  db = client.db(env.MONGO_DB_NAME);

  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized. Call connectMongo() first.');
  }
  return db;
}

export function getSessionSeatsCollection(): Collection<SessionSeat> {
  return getDb().collection<SessionSeat>(SESSION_SEATS_COLLECTION);
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
