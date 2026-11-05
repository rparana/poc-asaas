export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
    public readonly code: string = 'BAD_REQUEST',
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class SeatAlreadyTakenError extends AppError {
  constructor(seatNumber: string) {
    super(
      `Assento ${seatNumber} já está temporariamente retido ou ocupado por outro usuário.`,
      409,
      'SEAT_ALREADY_TAKEN',
    );
  }
}

export class SeatNotFoundError extends AppError {
  constructor(seatNumber: string, sessionId: string) {
    super(
      `Assento ${seatNumber} não foi encontrado na sessão ${sessionId}.`,
      404,
      'SEAT_NOT_FOUND',
    );
  }
}

export class SeatAlreadyReservedError extends AppError {
  constructor(seatNumber: string) {
    super(
      `Assento ${seatNumber} já foi confirmado e reservado permanentemente.`,
      409,
      'SEAT_ALREADY_RESERVED',
    );
  }
}

export class InvalidSeatHoldError extends AppError {
  constructor(
    message = 'A reserva temporária deste assento é inválida, expirou ou pertence a outro carrinho.',
  ) {
    super(message, 409, 'INVALID_SEAT_HOLD');
  }
}
