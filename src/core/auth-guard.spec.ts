jest.mock('passport', () => ({
  authenticate: jest.fn(),
}));

import { createMock } from '@golevelup/ts-jest';
import express, {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import passport from 'passport';
import request from 'supertest';
import { AuthGuard } from './auth-guard';
import { errorHandler } from './exception-filter';
import { HttpException, UnauthorizedException } from './http-exception';

type PassportVerifyCallback = (
  err: unknown,
  user: unknown,
  info: unknown,
) => void;

const authenticateMock = jest.mocked(passport.authenticate);

/**
 * Scripts the strategy: whatever passport would have decided is handed
 * straight to the verify callback the guard installed.
 */
const strategyAnswers = (err: unknown, user: unknown, info: unknown): void => {
  authenticateMock.mockImplementation(
    (_strategy, _options, callback): RequestHandler =>
      () => {
        (callback as PassportVerifyCallback)(err, user, info);
      },
  );
};

/**
 * Scripts a strategy that never reaches the verify callback and instead lets
 * the middleware chain continue — the redirect and challenge paths passport
 * takes on its own.
 */
const strategyContinues = (err?: unknown): void => {
  authenticateMock.mockImplementation(
    (): RequestHandler => (_req, _res, next) => {
      next(err);
    },
  );
};

describe('AuthGuard', () => {
  beforeEach(() => {
    authenticateMock.mockReset();
  });

  describe('how the strategy is invoked', () => {
    it('runs the named strategy without touching a session', async () => {
      strategyAnswers(null, { username: 'hantsy' }, undefined);
      const guard = new AuthGuard('jwt');

      await guard.canActivate(createMock<Request>(), createMock<Response>());

      expect(authenticateMock).toHaveBeenCalledTimes(1);
      expect(authenticateMock.mock.calls[0][0]).toBe('jwt');
      expect(authenticateMock.mock.calls[0][1]).toEqual({ session: false });
    });

    it('uses the strategy name it was constructed with', async () => {
      strategyAnswers(null, { username: 'hantsy' }, undefined);

      await new AuthGuard('local').canActivate(
        createMock<Request>(),
        createMock<Response>(),
      );

      expect(authenticateMock.mock.calls[0][0]).toBe('local');
    });
  });

  describe('a successful authentication', () => {
    it('attaches the principal and the strategy info to the request', async () => {
      const user = { username: 'hantsy', roles: ['USER'] };
      const info = { scope: 'read' };
      strategyAnswers(null, user, info);
      const req = createMock<Request>();

      await expect(
        new AuthGuard('jwt').canActivate(req, createMock<Response>()),
      ).resolves.toBe(true);

      expect(req.user).toBe(user);
      expect(req.authInfo).toBe(info);
    });

    it('lets the request through the middleware form with no error', async () => {
      const user = { username: 'hantsy' };
      strategyAnswers(null, user, undefined);
      const req = createMock<Request>();
      const next = jest.fn();

      new AuthGuard('jwt').use()(req, createMock<Response>(), next);
      await new Promise(process.nextTick);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBe(user);
    });
  });

  describe('a failed authentication', () => {
    it('rejects with an unauthorized exception when no principal was produced', async () => {
      strategyAnswers(null, false, { message: 'No auth token' });
      const req = createMock<Request>();

      await expect(
        new AuthGuard('jwt').canActivate(req, createMock<Response>()),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // The info still lands on the request even though the guard refused it.
      expect(req.authInfo).toEqual({ message: 'No auth token' });
    });

    it('builds the argument-less exception body, without an error key', async () => {
      strategyAnswers(null, undefined, undefined);

      const thrown = await new AuthGuard('jwt')
        .canActivate(createMock<Request>(), createMock<Response>())
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(thrown).toBeInstanceOf(HttpException);
      const exception = thrown as HttpException;
      expect(exception.getStatus()).toBe(401);
      expect(exception.getResponse()).toEqual({
        message: 'Unauthorized',
        statusCode: 401,
      });
      expect(exception.getResponse()).not.toHaveProperty('error');
    });

    it('hands the exception to next through the middleware form', async () => {
      strategyAnswers(null, null, undefined);
      const next = jest.fn();

      new AuthGuard('jwt').use()(
        createMock<Request>(),
        createMock<Response>(),
        next,
      );
      await new Promise(process.nextTick);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('an explicit strategy error', () => {
    it('is rethrown unchanged rather than flattened into a 401', async () => {
      const failure = new Error('token store unreachable');
      strategyAnswers(failure, undefined, undefined);

      await expect(
        new AuthGuard('jwt').canActivate(
          createMock<Request>(),
          createMock<Response>(),
        ),
      ).rejects.toBe(failure);
    });

    it('wins even when the strategy also produced a principal', async () => {
      const failure = new Error('expired refresh token');
      strategyAnswers(failure, { username: 'hantsy' }, undefined);
      const req = createMock<Request>();

      await expect(
        new AuthGuard('jwt').canActivate(req, createMock<Response>()),
      ).rejects.toBe(failure);

      expect(Object.hasOwn(req, 'user')).toBe(false);
    });
  });

  describe('when the strategy answers the chain itself', () => {
    it('resolves when passport continued without an error', async () => {
      strategyContinues();
      const req = createMock<Request>();

      await expect(
        new AuthGuard('jwt').canActivate(req, createMock<Response>()),
      ).resolves.toBe(true);

      expect(Object.hasOwn(req, 'user')).toBe(false);
      expect(Object.hasOwn(req, 'authInfo')).toBe(false);
    });

    it('rejects with whatever passport passed to next', async () => {
      const failure = new Error('strategy not registered');
      strategyContinues(failure);

      await expect(
        new AuthGuard('jwt').canActivate(
          createMock<Request>(),
          createMock<Response>(),
        ),
      ).rejects.toBe(failure);
    });
  });

  describe('handleRequest is the seam a subclass overrides', () => {
    it('returns the principal untouched on the base class', () => {
      const user = { username: 'hantsy' };

      expect(new AuthGuard('jwt').handleRequest(null, user, undefined)).toBe(
        user,
      );
    });

    it('lets a subclass widen what counts as success', async () => {
      class OptionalAuthGuard extends AuthGuard {
        handleRequest(err: unknown, user: unknown) {
          if (err) {
            throw err;
          }
          return user || { anonymous: true };
        }
      }
      strategyAnswers(null, false, undefined);
      const req = createMock<Request>();

      await expect(
        new OptionalAuthGuard('jwt').canActivate(req, createMock<Response>()),
      ).resolves.toBe(true);

      expect(req.user).toEqual({ anonymous: true });
    });
  });

  describe('over the wire', () => {
    const appFor = (guard: AuthGuard): express.Express => {
      const app = express();
      app.get('/protected', guard.use(), (req: Request, res: Response) => {
        res.json({ user: req.user });
      });
      app.use(errorHandler);
      return app;
    };

    let consoleError: jest.SpyInstance;

    beforeEach(() => {
      consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleError.mockRestore();
    });

    it('serves the route once the principal is attached', async () => {
      strategyAnswers(null, { username: 'hantsy' }, undefined);

      const res = await request(appFor(new AuthGuard('jwt'))).get('/protected');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ user: { username: 'hantsy' } });
    });

    it('answers exactly {"message":"Unauthorized","statusCode":401}', async () => {
      strategyAnswers(null, false, { message: 'No auth token' });

      const res = await request(appFor(new AuthGuard('jwt'))).get('/protected');

      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toBe(
        'application/json; charset=utf-8',
      );
      expect(res.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
      expect(res.body).not.toHaveProperty('error');
      expect(res.text).toBe('{"message":"Unauthorized","statusCode":401}');
    });

    it('does not turn an explicit strategy error into a 401', async () => {
      strategyAnswers(
        new Error('token store unreachable'),
        undefined,
        undefined,
      );

      const res = await request(appFor(new AuthGuard('jwt'))).get('/protected');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
    });
  });
});
