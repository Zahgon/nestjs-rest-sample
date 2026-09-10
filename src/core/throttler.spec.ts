import { createMock } from '@golevelup/ts-jest';
import { Request, Response } from 'express';
import { ThrottlerException, throttlerMessage } from './http-exception';
import { ThrottlerGuard, ThrottlerStorageService } from './throttler';

/**
 * Seam test for the hand-written replacement of the throttler the source
 * project pulled in as library code.
 *
 * The wire contract this pins is not derivable from a green build: a guard that
 * counted globally instead of per controller method, or that wrote the
 * `X-RateLimit-*` headers before deciding to reject, would compile and would
 * leave every inherited suite passing. Both are wrong against the running
 * source, so every property below is asserted rather than assumed:
 *
 *   - the bucket is per controller method, keyed `<controller>-<handler>-default-<ip>`;
 *   - a fresh window answers 10 requests with `X-RateLimit-Remaining` 9 down to 0;
 *   - the 11th throws, sets only `Retry-After`, and writes no `X-RateLimit-*`
 *     header at all — the 429 response carries `retry-after: 60` and nothing else;
 *   - a hit is handed back exactly one window after it was taken;
 *   - shutdown clears every pending give-back timer.
 */

const TTL = 60_000;
const LIMIT = 10;
const NOW = Date.UTC(2026, 8, 10, 12, 0, 0);

const IP = '10.0.0.1';
const OTHER_IP = '198.51.100.7';

const CONTROLLER = 'PostController';
const HANDLER = 'getAllPosts';
const SIBLING_HANDLER = 'createPost';

const makeRequest = (ip: string = IP): Request => createMock<Request>({ ip });

const makeResponse = (): Response =>
  createMock<Response>({ header: jest.fn().mockReturnThis() });

/**
 * The load-bearing assertion of this file: on a rejected request the guard
 * throws before it reaches the header block, so none of the three rate-limit
 * headers may ever appear on a 429.
 */
const expectNoRateLimitHeaders = (res: Response): void => {
  expect(res.header).not.toHaveBeenCalledWith(
    expect.stringMatching(/ratelimit/i),
    expect.anything(),
  );
  expect(res.header).not.toHaveBeenCalledWith(
    'X-RateLimit-Limit',
    expect.anything(),
  );
  expect(res.header).not.toHaveBeenCalledWith(
    'X-RateLimit-Remaining',
    expect.anything(),
  );
  expect(res.header).not.toHaveBeenCalledWith(
    'X-RateLimit-Reset',
    expect.anything(),
  );
};

const catchThrottled = (call: () => void): ThrottlerException => {
  try {
    call();
  } catch (error) {
    if (error instanceof ThrottlerException) {
      return error;
    }
    throw error;
  }
  throw new Error('expected the guard to throw ThrottlerException');
};

describe('core/throttler', () => {
  let storage: ThrottlerStorageService;
  let guard: ThrottlerGuard;
  let req: Request;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    storage = new ThrottlerStorageService();
    guard = new ThrottlerGuard({ ttl: TTL, limit: LIMIT }, storage);
    req = makeRequest();
  });

  afterEach(() => {
    storage.onApplicationShutdown();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const exhaustWindow = (handler: string = HANDLER): void => {
    for (let hit = 1; hit <= LIMIT; hit++) {
      guard.canActivate(CONTROLLER, handler, req, makeResponse());
    }
  };

  describe('bucket identity', () => {
    it('keys the bucket by controller, handler and tracker', () => {
      expect(guard.generateKey('AppController', 'getHello', IP)).toBe(
        `AppController-getHello-default-${IP}`,
      );
    });

    it('gives two handlers of the same controller different keys', () => {
      expect(guard.generateKey(CONTROLLER, HANDLER, IP)).not.toBe(
        guard.generateKey(CONTROLLER, SIBLING_HANDLER, IP),
      );
    });

    it('tracks the caller by req.ip', () => {
      expect(guard.getTracker(makeRequest(OTHER_IP))).toBe(OTHER_IP);
      expect(guard.generateKey(CONTROLLER, HANDLER, OTHER_IP)).not.toBe(
        guard.generateKey(CONTROLLER, HANDLER, IP),
      );
    });
  });

  describe('headers across a full window', () => {
    it('writes Limit, Remaining and Reset on every allowed request', () => {
      for (let hit = 1; hit <= LIMIT; hit++) {
        const res = makeResponse();

        expect(guard.canActivate(CONTROLLER, HANDLER, req, res)).toBe(true);

        expect(res.header).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
        expect(res.header).toHaveBeenCalledWith(
          'X-RateLimit-Remaining',
          `${LIMIT - hit}`,
        );
        expect(res.header).toHaveBeenCalledWith('X-RateLimit-Reset', '60');
        expect(res.header).toHaveBeenCalledTimes(3);
        expect(res.header).not.toHaveBeenCalledWith(
          'Retry-After',
          expect.anything(),
        );
      }
    });

    it('reports the seconds left in the current window, not the ttl', () => {
      const first = makeResponse();
      guard.canActivate(CONTROLLER, HANDLER, req, first);
      expect(first.header).toHaveBeenCalledWith('X-RateLimit-Reset', '60');

      jest.advanceTimersByTime(30_000);

      const second = makeResponse();
      guard.canActivate(CONTROLLER, HANDLER, req, second);
      expect(second.header).toHaveBeenCalledWith('X-RateLimit-Reset', '30');
      expect(second.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '8');
    });
  });

  describe('the rejected request', () => {
    it('throws ThrottlerException on the eleventh request', () => {
      exhaustWindow();

      const error = catchThrottled(() =>
        guard.canActivate(CONTROLLER, HANDLER, req, makeResponse()),
      );

      expect(error.getStatus()).toBe(429);
      expect(error.getResponse()).toBe(throttlerMessage);
      expect(error.message).toBe(throttlerMessage);
    });

    it('sets Retry-After and writes no X-RateLimit-* header on the 429', () => {
      exhaustWindow();
      const res = makeResponse();

      catchThrottled(() => guard.canActivate(CONTROLLER, HANDLER, req, res));

      expect(res.header).toHaveBeenCalledWith('Retry-After', '60');
      expect(res.header).toHaveBeenCalledTimes(1);
      expectNoRateLimitHeaders(res);
    });

    it('stays blocked and stops taking hits once the limit is passed', () => {
      exhaustWindow();
      catchThrottled(() =>
        guard.canActivate(CONTROLLER, HANDLER, req, makeResponse()),
      );

      const key = guard.generateKey(CONTROLLER, HANDLER, IP);
      expect(storage.storage.get(key)!.totalHits).toBe(LIMIT + 1);

      const res = makeResponse();
      const error = catchThrottled(() =>
        guard.canActivate(CONTROLLER, HANDLER, req, res),
      );

      expect(error.getStatus()).toBe(429);
      expect(storage.storage.get(key)!.totalHits).toBe(LIMIT + 1);
      expect(res.header).toHaveBeenCalledWith('Retry-After', '60');
      expect(res.header).toHaveBeenCalledTimes(1);
      expectNoRateLimitHeaders(res);
    });
  });

  describe('bucket independence', () => {
    it('gives every controller method its own ten requests', () => {
      exhaustWindow(HANDLER);
      catchThrottled(() =>
        guard.canActivate(CONTROLLER, HANDLER, req, makeResponse()),
      );

      for (let hit = 1; hit <= LIMIT; hit++) {
        const res = makeResponse();
        expect(guard.canActivate(CONTROLLER, SIBLING_HANDLER, req, res)).toBe(
          true,
        );
        expect(res.header).toHaveBeenCalledWith(
          'X-RateLimit-Remaining',
          `${LIMIT - hit}`,
        );
      }

      const error = catchThrottled(() =>
        guard.canActivate(CONTROLLER, SIBLING_HANDLER, req, makeResponse()),
      );
      expect(error.getStatus()).toBe(429);

      expect([...storage.storage.keys()]).toEqual([
        `${CONTROLLER}-${HANDLER}-default-${IP}`,
        `${CONTROLLER}-${SIBLING_HANDLER}-default-${IP}`,
      ]);
    });

    it('gives every caller its own ten requests', () => {
      exhaustWindow();
      catchThrottled(() =>
        guard.canActivate(CONTROLLER, HANDLER, req, makeResponse()),
      );

      const res = makeResponse();
      expect(
        guard.canActivate(CONTROLLER, HANDLER, makeRequest(OTHER_IP), res),
      ).toBe(true);
      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
    });
  });

  describe('window expiry', () => {
    it('hands every hit back one window later and resets the counter', () => {
      exhaustWindow();

      const key = guard.generateKey(CONTROLLER, HANDLER, IP);
      expect(storage.storage.get(key)!.totalHits).toBe(LIMIT);
      expect(jest.getTimerCount()).toBe(LIMIT);

      jest.advanceTimersByTime(TTL);

      expect(storage.storage.get(key)!.totalHits).toBe(0);
      expect(jest.getTimerCount()).toBe(0);

      const res = makeResponse();
      expect(guard.canActivate(CONTROLLER, HANDLER, req, res)).toBe(true);
      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Reset', '60');
      expect(storage.storage.get(key)!.expiresAt).toBe(NOW + TTL + TTL);
    });

    it('never blocks a caller that spreads its requests across windows', () => {
      for (let round = 0; round < 3; round++) {
        for (let hit = 1; hit <= LIMIT; hit++) {
          const res = makeResponse();
          expect(guard.canActivate(CONTROLLER, HANDLER, req, res)).toBe(true);
          expect(res.header).toHaveBeenCalledWith(
            'X-RateLimit-Remaining',
            `${LIMIT - hit}`,
          );
        }
        jest.advanceTimersByTime(TTL);
      }
    });

    it('lets the caller through again once the block has expired', () => {
      exhaustWindow();
      catchThrottled(() =>
        guard.canActivate(CONTROLLER, HANDLER, req, makeResponse()),
      );

      const key = guard.generateKey(CONTROLLER, HANDLER, IP);
      expect(storage.storage.get(key)!.isBlocked).toBe(true);

      jest.advanceTimersByTime(TTL);

      const res = makeResponse();
      expect(guard.canActivate(CONTROLLER, HANDLER, req, res)).toBe(true);

      expect(storage.storage.get(key)!.isBlocked).toBe(false);
      expect(storage.storage.get(key)!.totalHits).toBe(1);
      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Reset', '60');
      expect(res.header).toHaveBeenCalledTimes(3);
      expect(res.header).not.toHaveBeenCalledWith(
        'Retry-After',
        expect.anything(),
      );
    });
  });

  describe('ThrottlerStorageService', () => {
    it('creates the record on the first increment and counts the hit', () => {
      const result = storage.increment('k', TTL, LIMIT, TTL);

      expect(result.totalHits).toBe(1);
      expect(result.timeToExpire).toBe(60);
      expect(result.isBlocked).toBe(false);
      expect(storage.storage.get('k')).toEqual({
        totalHits: 1,
        expiresAt: NOW + TTL,
        blockExpiresAt: 0,
        isBlocked: false,
      });
    });

    it('returns a meaningless timeToBlockExpire while not blocked', () => {
      // blockExpiresAt starts at the epoch, so the derived value is a large
      // negative number. It is never surfaced because the guard only reads it
      // on the blocked branch.
      const result = storage.increment('k', TTL, LIMIT, TTL);

      expect(result.timeToBlockExpire).toBe(Math.ceil(-NOW / 1000));
      expect(result.timeToBlockExpire).toBeLessThan(0);
    });

    it('flips to blocked on the hit past the limit', () => {
      for (let hit = 1; hit <= LIMIT; hit++) {
        expect(storage.increment('k', TTL, LIMIT, TTL).isBlocked).toBe(false);
      }

      const blocked = storage.increment('k', TTL, LIMIT, TTL);

      expect(blocked.isBlocked).toBe(true);
      expect(blocked.totalHits).toBe(LIMIT + 1);
      expect(blocked.timeToBlockExpire).toBe(60);
      expect(storage.storage.get('k')).toEqual({
        totalHits: LIMIT + 1,
        expiresAt: NOW + TTL,
        blockExpiresAt: NOW + TTL,
        isBlocked: true,
      });
    });

    it('resets the record and takes a fresh hit once the block has expired', () => {
      const BLOCK = 5_000;

      for (let hit = 1; hit <= LIMIT + 1; hit++) {
        storage.increment('k', TTL, LIMIT, BLOCK);
      }
      expect(storage.storage.get('k')).toEqual({
        totalHits: LIMIT + 1,
        expiresAt: NOW + TTL,
        blockExpiresAt: NOW + BLOCK,
        isBlocked: true,
      });
      expect(jest.getTimerCount()).toBe(LIMIT + 1);

      jest.advanceTimersByTime(BLOCK);

      const result = storage.increment('k', TTL, LIMIT, BLOCK);

      expect(result).toEqual({
        totalHits: 1,
        timeToExpire: (TTL - BLOCK) / 1000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
      expect(storage.storage.get('k')).toEqual({
        totalHits: 1,
        expiresAt: NOW + TTL,
        blockExpiresAt: NOW + BLOCK,
        isBlocked: false,
      });
      // the reset drops every give-back timer the blocked window queued; the
      // fresh hit then schedules exactly one of its own.
      expect(jest.getTimerCount()).toBe(1);
    });

    it('clears every pending give-back timer on shutdown', () => {
      storage.increment('k', TTL, LIMIT, TTL);
      storage.increment('k', TTL, LIMIT, TTL);
      expect(storage.storage.get('k')!.totalHits).toBe(2);
      expect(jest.getTimerCount()).toBe(2);

      storage.onApplicationShutdown();

      expect(jest.getTimerCount()).toBe(0);
      jest.advanceTimersByTime(TTL * 2);
      expect(storage.storage.get('k')!.totalHits).toBe(2);
    });

    it('tolerates a second shutdown', () => {
      storage.increment('k', TTL, LIMIT, TTL);
      storage.onApplicationShutdown();

      expect(() => storage.onApplicationShutdown()).not.toThrow();
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('forHandler', () => {
    it('calls next() with no argument while under the limit', () => {
      const middleware = guard.forHandler(CONTROLLER, HANDLER);
      const res = makeResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(res.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
    });

    it('forwards ThrottlerException to next() instead of throwing', () => {
      const middleware = guard.forHandler(CONTROLLER, HANDLER);
      for (let hit = 1; hit <= LIMIT; hit++) {
        middleware(req, makeResponse(), jest.fn());
      }

      const res = makeResponse();
      const next = jest.fn();

      expect(() => middleware(req, res, next)).not.toThrow();

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(ThrottlerException));
      expect(res.header).toHaveBeenCalledWith('Retry-After', '60');
      expect(res.header).toHaveBeenCalledTimes(1);
      expectNoRateLimitHeaders(res);
    });
  });
});
