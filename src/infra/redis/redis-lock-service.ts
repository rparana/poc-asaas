import type { Redis } from 'ioredis';
import { getRedisClient } from './client.js';

const LUA_RELEASE_LOCK = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

export class RedisLockService {
  constructor(private readonly redis: Redis = getRedisClient()) {}

  private buildKey(sessionId: string, seatNumber: string): string {
    return `seat_lock:${sessionId}:${seatNumber}`;
  }

  /**
   * Tenta adquirir o lock distribuído para um assento usando SET NX EX.
   * Retorna true se o lock foi adquirido com sucesso, ou false caso o assento já esteja travado.
   */
  async acquireLock(
    sessionId: string,
    seatNumber: string,
    cartId: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const key = this.buildKey(sessionId, seatNumber);
    const result = await this.redis.set(key, cartId, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Libera o lock atômico via script Lua, garantindo que apenas o cartId
   * detentor daquele lock possa removê-lo.
   */
  async releaseLock(sessionId: string, seatNumber: string, cartId: string): Promise<boolean> {
    const key = this.buildKey(sessionId, seatNumber);
    const result = await this.redis.eval(LUA_RELEASE_LOCK, 1, key, cartId);
    return result === 1;
  }
}
