import { env } from '../../config/env.js';
import {
  SeatAlreadyReservedError,
  SeatAlreadyTakenError,
  SeatNotFoundError,
} from '../../domain/errors/seat-errors.js';
import type { SessionSeat } from '../../infra/db/models/session-seat.js';
import { getSessionSeatsCollection } from '../../infra/db/mongo.js';
import { RedisLockService } from '../../infra/redis/redis-lock-service.js';

export interface HoldSeatInput {
  sessionId: string;
  seatNumber: string;
  cartId: string;
  ttlSeconds?: number;
}

export class HoldSeatUseCase {
  constructor(private readonly lockService: RedisLockService = new RedisLockService()) {}

  async execute(input: HoldSeatInput): Promise<SessionSeat> {
    const { sessionId, seatNumber, cartId } = input;
    const ttlSeconds = input.ttlSeconds ?? env.SEAT_HOLD_TTL_SECONDS;

    // 1. Camada 1: Adquire o lock distribuído no Redis (Fast Fail)
    const lockAcquired = await this.lockService.acquireLock(
      sessionId,
      seatNumber,
      cartId,
      ttlSeconds,
    );

    if (!lockAcquired) {
      throw new SeatAlreadyTakenError(seatNumber);
    }

    // 2. Camada 2: Persistência atômica condicional no MongoDB
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const collection = getSessionSeatsCollection();

    try {
      const updatedSeat = await collection.findOneAndUpdate(
        {
          sessionId,
          seatNumber,
          $or: [{ status: 'AVAILABLE' }, { status: 'HELD', expiresAt: { $lt: now } }],
        },
        {
          $set: {
            status: 'HELD',
            cartId,
            expiresAt,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );

      // 3. Compensação em caso de inconsistência de estado
      if (!updatedSeat) {
        await this.lockService.releaseLock(sessionId, seatNumber, cartId);

        const existingSeat = await collection.findOne({ sessionId, seatNumber });
        if (!existingSeat) {
          throw new SeatNotFoundError(seatNumber, sessionId);
        }
        if (existingSeat.status === 'RESERVED') {
          throw new SeatAlreadyReservedError(seatNumber);
        }

        throw new SeatAlreadyTakenError(seatNumber);
      }

      return updatedSeat;
    } catch (error) {
      // Garante a liberação do lock em caso de qualquer exceção no banco
      if (
        !(error instanceof SeatAlreadyTakenError) &&
        !(error instanceof SeatNotFoundError) &&
        !(error instanceof SeatAlreadyReservedError)
      ) {
        await this.lockService.releaseLock(sessionId, seatNumber, cartId);
      }
      throw error;
    }
  }
}
