import type { ObjectId } from 'mongodb';

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'RESERVED';

export interface SessionSeat {
  _id?: ObjectId;
  sessionId: string;
  seatNumber: string;
  status: SeatStatus;
  cartId?: string | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
