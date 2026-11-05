import {
  InvalidSeatHoldError,
  SeatAlreadyReservedError,
  SeatNotFoundError,
} from '../../domain/errors/seat-errors.js';
import type { SessionSeat } from '../../infra/db/models/session-seat.js';
import { getSessionSeatsCollection } from '../../infra/db/mongo.js';
import { RedisLockService } from '../../infra/redis/redis-lock-service.js';
import { type SessionEventBus, sessionEventBus } from '../../infra/redis/session-event-bus.js';

export interface ConfirmSeatInput {
  sessionId: string;
  seatNumber: string;
  cartId: string;
}

export class ConfirmSeatUseCase {
  constructor(
    private readonly lockService: RedisLockService = new RedisLockService(),
    private readonly eventBus: SessionEventBus = sessionEventBus,
  ) {}

  async execute(input: ConfirmSeatInput): Promise<SessionSeat> {
    const { sessionId, seatNumber, cartId } = input;
    const now = new Date();
    const collection = getSessionSeatsCollection();

    // 1. Atualização atômica condicional no MongoDB
    const updatedSeat = await collection.findOneAndUpdate(
      {
        sessionId,
        seatNumber,
        status: 'HELD',
        cartId,
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: 'RESERVED',
          expiresAt: null,
          updatedAt: now,
        },
      },
      { returnDocument: 'after' },
    );

    if (!updatedSeat) {
      const existingSeat = await collection.findOne({ sessionId, seatNumber });

      if (!existingSeat) {
        throw new SeatNotFoundError(seatNumber, sessionId);
      }
      if (existingSeat.status === 'RESERVED') {
        throw new SeatAlreadyReservedError(seatNumber);
      }
      if (existingSeat.cartId !== cartId) {
        throw new InvalidSeatHoldError(
          'Este assento não está retido pelo seu carrinho de compras.',
        );
      }
      if (existingSeat.expiresAt && existingSeat.expiresAt <= now) {
        throw new InvalidSeatHoldError(
          'O tempo limite da reserva temporária expirou. Assento liberado.',
        );
      }

      throw new InvalidSeatHoldError();
    }

    // 2. Remove o lock distribuído no Redis (Script Lua seguro)
    await this.lockService.releaseLock(sessionId, seatNumber, cartId);

    // Publica evento de domínio em tempo real
    await this.eventBus.publish(sessionId, {
      event: 'SEAT_RESERVED',
      sessionId,
      seatNumber,
    });

    return updatedSeat;
  }
}
