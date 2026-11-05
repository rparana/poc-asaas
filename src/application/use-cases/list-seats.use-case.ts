import type { SeatStatus, SessionSeat } from '../../infra/db/models/session-seat.js';
import { getSessionSeatsCollection } from '../../infra/db/mongo.js';

export interface SeatItemOutput {
  seatNumber: string;
  status: SeatStatus;
  expiresAt?: Date | null;
}

export interface ListSeatsOutput {
  sessionId: string;
  totalSeats: number;
  availableCount: number;
  heldCount: number;
  reservedCount: number;
  seats: SeatItemOutput[];
}

export class ListSeatsUseCase {
  async execute(sessionId: string): Promise<ListSeatsOutput> {
    const collection = getSessionSeatsCollection();
    const rawSeats = await collection.find({ sessionId }).sort({ seatNumber: 1 }).toArray();

    const now = new Date();
    let availableCount = 0;
    let heldCount = 0;
    let reservedCount = 0;

    const seats: SeatItemOutput[] = rawSeats.map((seat: SessionSeat) => {
      let effectiveStatus = seat.status;

      // Se HELD tiver expirado, o status visível efetivo é AVAILABLE (RF05)
      if (seat.status === 'HELD' && seat.expiresAt && seat.expiresAt <= now) {
        effectiveStatus = 'AVAILABLE';
      }

      if (effectiveStatus === 'AVAILABLE') {
        availableCount++;
      } else if (effectiveStatus === 'HELD') {
        heldCount++;
      } else if (effectiveStatus === 'RESERVED') {
        reservedCount++;
      }

      return {
        seatNumber: seat.seatNumber,
        status: effectiveStatus,
        expiresAt: effectiveStatus === 'HELD' ? seat.expiresAt : null,
      };
    });

    return {
      sessionId,
      totalSeats: seats.length,
      availableCount,
      heldCount,
      reservedCount,
      seats,
    };
  }
}
