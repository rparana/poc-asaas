import { InvalidSeatHoldError, SeatNotFoundError } from '../../domain/errors/seat-errors.js';
import type { SessionSeat } from '../../infra/db/models/session-seat.js';
import { getSessionSeatsCollection } from '../../infra/db/mongo.js';
import { RedisLockService } from '../../infra/redis/redis-lock-service.js';
import { type SessionEventBus, sessionEventBus } from '../../infra/redis/session-event-bus.js';

export interface ReleaseSeatInput {
  sessionId: string;
  seatNumber: string;
  cartId: string;
}

export class ReleaseSeatUseCase {
  constructor(
    private readonly lockService: RedisLockService = new RedisLockService(),
    private readonly eventBus: SessionEventBus = sessionEventBus,
  ) {}

  async execute(input: ReleaseSeatInput): Promise<SessionSeat> {
    const { sessionId, seatNumber, cartId } = input;
    const now = new Date();
    const collection = getSessionSeatsCollection();

    // 1. Atualiza no MongoDB se ainda estiver como HELD pelo cartId
    const updatedSeat = await collection.findOneAndUpdate(
      {
        sessionId,
        seatNumber,
        status: 'HELD',
        cartId,
      },
      {
        $set: {
          status: 'AVAILABLE',
          cartId: null,
          expiresAt: null,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );

    // 2. Libera o lock atômico no Redis
    await this.lockService.releaseLock(sessionId, seatNumber, cartId);

    // Publica evento de domínio em tempo real
    await this.eventBus.publish(sessionId, {
      event: 'SEAT_RELEASED',
      sessionId,
      seatNumber,
    });

    if (!updatedSeat) {
      const existingSeat = await collection.findOne({ sessionId, seatNumber });
      if (!existingSeat) {
        throw new SeatNotFoundError(seatNumber, sessionId);
      }
      if (existingSeat.status === 'AVAILABLE') {
        return existingSeat;
      }
      throw new InvalidSeatHoldError(
        'Não foi possível liberar o assento: ele não está retido pelo cartId informado.',
      );
    }

    return updatedSeat;
  }
}
