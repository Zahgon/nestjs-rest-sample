import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ThrottlerException } from './http-exception';

export interface ThrottlerOptions {
  ttl: number;
  limit: number;
}

interface ThrottlerRecord {
  totalHits: number;
  expiresAt: number;
  blockExpiresAt: number;
  isBlocked: boolean;
}

export interface ThrottlerIncrementResult {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * In-memory fixed window keyed per throttled route. A hit is scheduled to be
 * given back exactly one window after it was taken, so a caller that spreads
 * its requests out is never blocked.
 */
export class ThrottlerStorageService {
  private readonly _storage = new Map<string, ThrottlerRecord>();
  private readonly timeoutIds: NodeJS.Timeout[] = [];

  get storage(): Map<string, ThrottlerRecord> {
    return this._storage;
  }

  private getExpirationTime(key: string): number {
    return Math.ceil((this.storage.get(key)!.expiresAt - Date.now()) / 1000);
  }

  private getBlockExpirationTime(key: string): number {
    return Math.ceil(
      (this.storage.get(key)!.blockExpiresAt - Date.now()) / 1000,
    );
  }

  private fireHitCount(key: string, ttl: number): void {
    const record = this.storage.get(key)!;
    record.totalHits += 1;
    const timeoutId = setTimeout(() => {
      this.storage.get(key)!.totalHits -= 1;
      clearTimeout(timeoutId);
      const index = this.timeoutIds.indexOf(timeoutId);
      if (index >= 0) {
        this.timeoutIds.splice(index, 1);
      }
    }, ttl);
    if (typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }
    this.timeoutIds.push(timeoutId);
  }

  private resetBlockedRequest(key: string): void {
    const record = this.storage.get(key)!;
    record.isBlocked = false;
    record.totalHits = 0;
    this.timeoutIds.splice(0).forEach(clearTimeout);
  }

  increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): ThrottlerIncrementResult {
    if (!this.storage.has(key)) {
      this.storage.set(key, {
        totalHits: 0,
        expiresAt: Date.now() + ttl,
        blockExpiresAt: 0,
        isBlocked: false,
      });
    }

    let timeToExpire = this.getExpirationTime(key);
    if (timeToExpire <= 0) {
      this.storage.get(key)!.expiresAt = Date.now() + ttl;
      timeToExpire = this.getExpirationTime(key);
    }

    if (!this.storage.get(key)!.isBlocked) {
      this.fireHitCount(key, ttl);
    }

    if (
      this.storage.get(key)!.totalHits > limit &&
      !this.storage.get(key)!.isBlocked
    ) {
      this.storage.get(key)!.isBlocked = true;
      this.storage.get(key)!.blockExpiresAt = Date.now() + blockDuration;
    }

    const timeToBlockExpire = this.getBlockExpirationTime(key);
    if (timeToBlockExpire <= 0 && this.storage.get(key)!.isBlocked) {
      this.resetBlockedRequest(key);
      this.fireHitCount(key, ttl);
    }

    return {
      totalHits: this.storage.get(key)!.totalHits,
      timeToExpire,
      isBlocked: this.storage.get(key)!.isBlocked,
      timeToBlockExpire,
    };
  }

  onApplicationShutdown(): void {
    this.timeoutIds.splice(0).forEach(clearTimeout);
  }
}

/**
 * Guards every route. The counter is scoped to the caller and to the single
 * handler being called, so exhausting one endpoint leaves the others usable.
 */
export class ThrottlerGuard {
  private readonly headerPrefix = 'X-RateLimit';

  constructor(
    private readonly options: ThrottlerOptions,
    private readonly storageService: ThrottlerStorageService,
  ) {}

  getTracker(req: Request): string {
    return req.ip as string;
  }

  generateKey(controller: string, handler: string, suffix: string): string {
    return `${controller}-${handler}-default-${suffix}`;
  }

  canActivate(
    controller: string,
    handler: string,
    req: Request,
    res: Response,
  ): boolean {
    const { ttl, limit } = this.options;
    const tracker = this.getTracker(req);
    const key = this.generateKey(controller, handler, tracker);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      this.storageService.increment(key, ttl, limit, ttl);

    if (isBlocked) {
      res.header('Retry-After', `${timeToBlockExpire}`);
      throw new ThrottlerException();
    }

    res.header(`${this.headerPrefix}-Limit`, `${limit}`);
    res.header(
      `${this.headerPrefix}-Remaining`,
      `${Math.max(0, limit - totalHits)}`,
    );
    res.header(`${this.headerPrefix}-Reset`, `${timeToExpire}`);
    return true;
  }

  /**
   * Builds the middleware placed in front of a single controller handler.
   */
  forHandler(controller: string, handler: string): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        this.canActivate(controller, handler, req, res);
        next();
      } catch (error) {
        next(error);
      }
    };
  }
}
