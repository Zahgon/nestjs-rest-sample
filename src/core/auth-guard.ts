import { NextFunction, Request, RequestHandler, Response } from 'express';
import passport from 'passport';
import { UnauthorizedException } from './http-exception';

/**
 * Runs a passport strategy for a single request and decides what its outcome
 * means. Authentication is stateless, so nothing is written to a session; the
 * principal produced by the strategy is attached to the request instead.
 *
 * `handleRequest` is the single place where a failure is turned into a thrown
 * exception, so a subclass can widen or narrow what counts as a failure
 * without touching the surrounding plumbing.
 */
export class AuthGuard {
  constructor(protected readonly type: string) {}

  canActivate(req: Request, res: Response): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const handler = passport.authenticate(
        this.type,
        { session: false },
        (err: any, user: any, info: any) => {
          try {
            (req as any).authInfo = info;
            (req as any).user = this.handleRequest(err, user, info);
            resolve(true);
          } catch (error) {
            reject(error);
          }
        },
      );
      handler(req, res, (err?: any) => (err ? reject(err) : resolve(true)));
    });
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }

  /**
   * The middleware form used when wiring the guard onto a route.
   */
  use(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      this.canActivate(req, res)
        .then(() => next())
        .catch(next);
    };
  }
}
