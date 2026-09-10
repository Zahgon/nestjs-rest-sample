import { NextFunction, Request, RequestHandler, Response } from 'express';
import { isObservable, lastValueFrom } from 'rxjs';

const isNil = (value: any): boolean => value === null || value === undefined;
const isObject = (value: any): boolean =>
  value !== null && typeof value === 'object';

/**
 * Writes whatever a handler returned. An object is serialised as JSON, any
 * other value is written as-is — which is why a handler returning a bare
 * string answers as HTML rather than as JSON.
 */
export const reply = (res: Response, body: any): void => {
  if (isNil(body)) {
    res.send();
    return;
  }
  if (isObject(body)) {
    res.json(body);
    return;
  }
  res.send(String(body));
};

export type RouteHandler = (req: Request, res: Response) => any;

/**
 * Reduces whatever a handler returned to a plain value. A route that has to
 * await a pipe before calling its controller returns a promise wrapping the
 * controller's stream, so unwrapping has to repeat until neither layer is
 * left rather than peeling a single one.
 */
const resolveResult = async (returned: any): Promise<any> => {
  let value = returned;
  while (isObservable(value) || value instanceof Promise) {
    value = isObservable(value)
      ? await lastValueFrom(value, { defaultValue: undefined })
      : await value;
  }
  return value;
};

/**
 * Adapts a controller method to a middleware. A returned promise or stream is
 * resolved to its value first; a handler that answered for itself is left
 * alone, and anything thrown is forwarded to the error handler.
 */
export const handle =
  (fn: RouteHandler): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = await resolveResult(fn(req, res));
      if (res.headersSent || res.writableEnded) {
        return;
      }
      reply(res, body);
    } catch (error) {
      next(error);
    }
  };

export interface RouteDeps {
  throttler: import('./throttler').ThrottlerGuard;
  validationPipe: import('./validation').ValidationPipe;
}
