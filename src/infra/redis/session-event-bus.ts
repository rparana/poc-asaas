import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';
import { getRedisClient } from './client.js';

export type SessionEventType = 'SEAT_HELD' | 'SEAT_RESERVED' | 'SEAT_RELEASED';

export interface SeatHeldEvent {
  event: 'SEAT_HELD';
  sessionId: string;
  seatNumber: string;
  cartId: string;
  expiresAt: string;
}

export interface SeatReservedEvent {
  event: 'SEAT_RESERVED';
  sessionId: string;
  seatNumber: string;
}

export interface SeatReleasedEvent {
  event: 'SEAT_RELEASED';
  sessionId: string;
  seatNumber: string;
}

export type SessionDomainEvent = SeatHeldEvent | SeatReservedEvent | SeatReleasedEvent;

export class SessionEventBus {
  private static instance: SessionEventBus | null = null;
  private readonly emitter = new EventEmitter();
  private subscriber: Redis | null = null;
  private isSubscribed = false;

  private constructor(private readonly publisher: Redis = getRedisClient()) {
    // Aumenta o limite de listeners para suportar múltiplas abas/conexões simultâneas
    this.emitter.setMaxListeners(100);
  }

  public static getInstance(): SessionEventBus {
    if (!SessionEventBus.instance) {
      SessionEventBus.instance = new SessionEventBus();
    }
    return SessionEventBus.instance;
  }

  private async ensureSubscriber(): Promise<void> {
    if (this.isSubscribed && this.subscriber) {
      return;
    }

    this.subscriber = this.publisher.duplicate();

    this.subscriber.on('error', (err) => {
      console.error('[SessionEventBus] Subscriber error:', err);
    });

    await this.subscriber.psubscribe('session:*:events');

    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      try {
        const match = channel.match(/^session:(.+):events$/);
        if (match) {
          const sessionId = match[1];
          const event: SessionDomainEvent = JSON.parse(message);
          this.emitter.emit(`session:${sessionId}`, event);
        }
      } catch (err) {
        console.error('[SessionEventBus] Failed to parse Redis message:', err);
      }
    });

    this.isSubscribed = true;
  }

  /**
   * Publica um evento de domínio no canal da sessão via Redis Pub/Sub.
   */
  async publish(sessionId: string, event: SessionDomainEvent): Promise<void> {
    const channel = `session:${sessionId}:events`;
    await this.publisher.publish(channel, JSON.stringify(event));
  }

  /**
   * Inscreve um ouvinte para receber eventos de uma sessão específica.
   * Retorna uma função de cancelamento de inscrição (unsubscribe).
   */
  async subscribe(
    sessionId: string,
    listener: (event: SessionDomainEvent) => void,
  ): Promise<() => void> {
    await this.ensureSubscriber();

    const topic = `session:${sessionId}`;
    this.emitter.on(topic, listener);

    return () => {
      this.emitter.off(topic, listener);
    };
  }

  async close(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.punsubscribe('session:*:events');
      await this.subscriber.quit();
      this.subscriber = null;
      this.isSubscribed = false;
    }
    this.emitter.removeAllListeners();
  }
}

export const sessionEventBus = SessionEventBus.getInstance();
