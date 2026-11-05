import type { SessionSeat } from './models/session-seat.js';
import { closeMongo, connectMongo, getSessionSeatsCollection } from './mongo.js';

export async function runSeed(): Promise<void> {
  console.log('🌱 Starting database seed...');

  try {
    await connectMongo();
    const collection = getSessionSeatsCollection();

    // 1. Create compound unique index: { sessionId: 1, seatNumber: 1 }
    console.log('Creating compound unique index { sessionId: 1, seatNumber: 1 }...');
    const indexName = await collection.createIndex(
      { sessionId: 1, seatNumber: 1 },
      { unique: true, name: 'session_seat_unique_idx' },
    );
    console.log(`✅ Index created or verified: ${indexName}`);

    // 2. Populate test session: 'sessao-cinema-101' with 20 seats (A1 to A20)
    const sessionId = 'sessao-cinema-101';
    console.log(`Populating session "${sessionId}" with 20 seats (A1 to A20)...`);

    // Reset existing seats for this session to ensure idempotent state
    await collection.deleteMany({ sessionId });

    const now = new Date();
    const seatsToInsert: SessionSeat[] = Array.from({ length: 20 }, (_, index) => {
      const seatNumber = `A${index + 1}`;
      return {
        sessionId,
        seatNumber,
        status: 'AVAILABLE',
        cartId: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const result = await collection.insertMany(seatsToInsert);
    console.log(`✅ Inserted ${result.insertedCount} seats for session "${sessionId}".`);

    console.log('🌱 Seed completed successfully!');
  } catch (error) {
    console.error('❌ Error executing database seed:', error);
    process.exitCode = 1;
  } finally {
    await closeMongo();
  }
}

// Execute when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSeed();
}
