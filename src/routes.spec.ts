import compression from 'compression';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import * as jwt from 'jsonwebtoken';
import passport from 'passport';
import { of } from 'rxjs';
import request from 'supertest';

import { AppController, createAppRouter } from './app.controller';
import { AuthController, createAuthRouter } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { RefreshTokenDto } from './auth/dto/refresh-token.dto';
import { AuthenticatedRequest } from './auth/interface/authenticated-request.interface';
import { JwtStrategy } from './auth/strategy/jwt.strategy';
import { LocalStrategy } from './auth/strategy/local.strategy';
import { JwtConfig } from './config/jwt.config';
import { errorHandler, notFoundHandler } from './core/exception-filter';
import { RouteDeps } from './core/route';
import {
  ThrottlerGuard,
  ThrottlerOptions,
  ThrottlerStorageService,
} from './core/throttler';
import { ValidationPipe } from './core/validation';
import { createPostRouter, PostController } from './post/post.controller';
import { RoleType } from './shared/enum/role-type.enum';
import {
  createProfileRouter,
  ProfileController,
} from './user/profile.controller';
import {
  createRegisterRouter,
  RegisterController,
} from './user/register.controller';
import { RegisterDto } from './user/register.dto';
import { createUserRouter, UserController } from './user/user.controller';

/**
 * Pins the routing seam.
 *
 * NestJS derived the whole route table from decorators; the Express port
 * derives it from six `create*Router` factories plus the mount table in
 * `src/app.ts`. A wrong prefix, a wrong verb, a dropped guard or guards in the
 * wrong order all still compile and still leave every other suite green,
 * because no other suite drives a router — the controller specs call the
 * controller methods directly.
 *
 * So the app under test is assembled here the way `createApp` assembles it:
 * the same middleware order, the same six routers at the same prefixes in the
 * same order, and the same terminal not-found and error handlers. Only the
 * controllers are stubbed, so nothing reaches MongoDB. The throttler, the
 * roles guard, the JWT guard, the local guard, the validation pipe, the object
 * id pipe and both passport strategies are the production ones.
 *
 * `setupSwagger` is left out deliberately: it mounts under `/api`, touches no
 * path in the table below, and drags the whole `swagger-ui-dist` bundle in.
 */

const POST_ID = '5ee49c3115a4e75254bb732e';
const COMMENT_ID = '5ee49c3115a4e75254bb7331';
const USER_ID = '5ee49c3115a4e75254bb7332';

const JWT_SECRET = 'routes-spec-secret';

/** The values `createContainer` builds the production guard with. */
const THROTTLER_OPTIONS: ThrottlerOptions = { ttl: 60000, limit: 10 };

/** The pipe `bootstrap` builds, option for option. */
const validationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
};

const jwtTestConfig: JwtConfig = {
  secretKey: JWT_SECRET,
  expiresIn: '3600s',
  refreshSecretKey: 'routes-spec-refresh-secret',
  refreshExpiresIn: '7d',
};

const VALID_POST = { title: 'test title', content: 'test content' };
const VALID_COMMENT = { content: 'test comment' };
const VALID_REGISTRATION = {
  username: 'tester',
  email: 'tester@example.com',
  password: 'password12',
  firstName: 'Test',
  lastName: 'User',
};

const bearer = (...roles: RoleType[]): string =>
  'Bearer ' +
  jwt.sign(
    {
      upn: 'tester',
      sub: USER_ID,
      email: 'tester@example.com',
      roles,
    },
    JWT_SECRET,
    { expiresIn: 3600 },
  );

/**
 * The principal `JwtStrategy#validate` builds from the token minted above.
 */
const PRINCIPAL = {
  username: 'tester',
  email: 'tester@example.com',
  id: USER_ID,
  roles: [RoleType.USER],
};

/**
 * Stand-ins for the six controllers. Every method that answers for itself
 * writes the same status, headers and body the real one writes, so a status or
 * a `Location` asserted below is the route's contract and not the stub's
 * invention.
 */
const createStubs = () => ({
  app: {
    getHello: jest.fn((): string => 'Hello World!'),
  },
  post: {
    getAllPosts: jest.fn((_keyword?: string, _limit?: number, _skip?: number) =>
      of([{ _id: POST_ID, ...VALID_POST }]),
    ),
    getPostById: jest.fn((id: string) => of({ _id: id, ...VALID_POST })),
    createPost: jest.fn((_post: unknown, res: Response) =>
      of(
        res
          .location('/posts/' + POST_ID)
          .status(201)
          .send(),
      ),
    ),
    updatePost: jest.fn((_id: string, _post: unknown, res: Response) =>
      of(res.status(204).send()),
    ),
    deletePostById: jest.fn((_id: string, res: Response) =>
      of(res.status(204).send()),
    ),
    createCommentForPost: jest.fn((id: string, _data: unknown, res: Response) =>
      of(
        res
          .location('/posts/' + id + '/comments/' + COMMENT_ID)
          .status(201)
          .send(),
      ),
    ),
    getAllCommentsOfPost: jest.fn((id: string) =>
      of([{ _id: COMMENT_ID, post: id, ...VALID_COMMENT }]),
    ),
  },
  auth: {
    login: jest.fn((_req: AuthenticatedRequest) =>
      of({ access_token: 'login-access', refresh_token: 'login-refresh' }),
    ),
    refresh: jest.fn((_dto: RefreshTokenDto) =>
      of({
        access_token: 'refreshed-access',
        refresh_token: 'refreshed-refresh',
      }),
    ),
  },
  profile: {
    getProfile: jest.fn((req: Request) => req.user),
  },
  user: {
    getUser: jest.fn((id: string, _withPosts?: boolean) =>
      of({ _id: id, username: 'tester' }),
    ),
  },
  register: {
    register: jest.fn(async (_dto: RegisterDto, res: Response) =>
      res
        .location('/users/' + USER_ID)
        .status(201)
        .send(),
    ),
  },
});

type Stubs = ReturnType<typeof createStubs>;

/**
 * The stand-in behind the local strategy. The login route never reaches the
 * auth service — the strategy does — so only `validateUser` is spelled out.
 */
const authServiceStub = {
  validateUser: jest.fn((username: string, _password: string) =>
    of({
      username,
      id: USER_ID,
      email: 'tester@example.com',
      roles: [RoleType.USER],
    }),
  ),
};

interface Harness {
  readonly app: Express;
  readonly throttlerStorage: ThrottlerStorageService;
}

/**
 * Mirrors `createApp`: same middleware order, same six mounts in the same
 * order, same terminal handlers.
 */
const buildApp = (stubs: Stubs): Harness => {
  const throttlerStorage = new ThrottlerStorageService();
  const throttler = new ThrottlerGuard(THROTTLER_OPTIONS, throttlerStorage);
  const validationPipe = new ValidationPipe(validationPipeOptions);
  const routeDeps: RouteDeps = { throttler, validationPipe };

  const app = express();

  app.use(cors());
  app.use(helmet());
  app.use(compression());

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(
    '/',
    createAppRouter(stubs.app as unknown as AppController, routeDeps),
  );
  app.use(
    '/posts',
    createPostRouter(() => stubs.post as unknown as PostController, routeDeps),
  );
  app.use(
    '/auth',
    createAuthRouter(stubs.auth as unknown as AuthController, routeDeps),
  );
  app.use(
    '/',
    createProfileRouter(
      stubs.profile as unknown as ProfileController,
      routeDeps,
    ),
  );
  app.use(
    '/users',
    createUserRouter(stubs.user as unknown as UserController, routeDeps),
  );
  app.use(
    '/register',
    createRegisterRouter(
      stubs.register as unknown as RegisterController,
      routeDeps,
    ),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, throttlerStorage };
};

type HttpMethod = 'get' | 'post' | 'put' | 'delete';

type ProbeHeaders = Record<string, string | undefined>;

/**
 * The throttler sits inside every matched route, so its headers are the
 * fingerprint of "a route matched and its middleware chain started".
 */
const expectRateLimited = (headers: ProbeHeaders): void => {
  expect(headers['x-ratelimit-limit']).toBe(String(THROTTLER_OPTIONS.limit));
  expect(headers['x-ratelimit-remaining']).toBeDefined();
  expect(headers['x-ratelimit-reset']).toBeDefined();
};

const expectNotRateLimited = (headers: ProbeHeaders): void => {
  expect(headers['x-ratelimit-limit']).toBeUndefined();
  expect(headers['x-ratelimit-remaining']).toBeUndefined();
  expect(headers['x-ratelimit-reset']).toBeUndefined();
};

describe('routing seam', () => {
  let stubs: Stubs;
  let harness: Harness;

  const probe = (method: HttpMethod, path: string) => {
    const agent = request(harness.app);
    switch (method) {
      case 'get':
        return agent.get(path);
      case 'post':
        return agent.post(path);
      case 'put':
        return agent.put(path);
      case 'delete':
        return agent.delete(path);
    }
  };

  beforeAll(() => {
    passport.use(new JwtStrategy(jwtTestConfig));
    passport.use(new LocalStrategy(authServiceStub as unknown as AuthService));
  });

  afterAll(() => {
    passport.unuse('jwt');
    passport.unuse('local');
  });

  beforeEach(() => {
    stubs = createStubs();
    harness = buildApp(stubs);
  });

  afterEach(() => {
    // The fixed-window store schedules one timeout per hit; give them back so
    // nothing survives the suite.
    harness.throttlerStorage.onApplicationShutdown();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------
  // The route table, row by row.
  // ---------------------------------------------------------------------

  describe('the table answers on the declared method and prefix', () => {
    it('GET / returns the greeting as html', async () => {
      const res = await probe('get', '/');

      expect(res.status).toBe(200);
      expect(res.text).toBe('Hello World!');
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(stubs.app.getHello).toHaveBeenCalledTimes(1);
      expectRateLimited(res.headers);
    });

    it('GET /posts lists posts', async () => {
      const res = await probe('get', '/posts');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ _id: POST_ID, ...VALID_POST }]);
      expect(stubs.post.getAllPosts).toHaveBeenCalledWith(undefined, 10, 0);
    });

    it('GET /posts honours ?q= ?limit= ?skip=', async () => {
      const res = await request(harness.app)
        .get('/posts')
        .query({ q: 'title', limit: 5, skip: 2 });

      expect(res.status).toBe(200);
      expect(stubs.post.getAllPosts).toHaveBeenCalledWith('title', 5, 2);
    });

    it('GET /posts/:id returns one post', async () => {
      const res = await probe('get', '/posts/' + POST_ID);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ _id: POST_ID, ...VALID_POST });
      expect(stubs.post.getPostById).toHaveBeenCalledWith(POST_ID);
    });

    it('POST /posts creates a post and points at it', async () => {
      const res = await request(harness.app)
        .post('/posts')
        .set('Authorization', bearer(RoleType.USER))
        .send(VALID_POST);

      expect(res.status).toBe(201);
      expect(res.text || '').toBe('');
      expect(res.headers['location']).toBe('/posts/' + POST_ID);
      expect(stubs.post.createPost).toHaveBeenCalledTimes(1);
    });

    it('PUT /posts/:id updates a post', async () => {
      const res = await request(harness.app)
        .put('/posts/' + POST_ID)
        .set('Authorization', bearer(RoleType.USER))
        .send(VALID_POST);

      expect(res.status).toBe(204);
      expect(res.text || '').toBe('');
      expect(stubs.post.updatePost).toHaveBeenCalledTimes(1);
      expect(stubs.post.updatePost.mock.calls[0][0]).toBe(POST_ID);
    });

    it('DELETE /posts/:id deletes a post', async () => {
      const res = await request(harness.app)
        .delete('/posts/' + POST_ID)
        .set('Authorization', bearer(RoleType.ADMIN))
        .send();

      expect(res.status).toBe(204);
      expect(res.text || '').toBe('');
      expect(stubs.post.deletePostById).toHaveBeenCalledTimes(1);
      expect(stubs.post.deletePostById.mock.calls[0][0]).toBe(POST_ID);
    });

    it('POST /posts/:id/comments creates a comment and points at it', async () => {
      const res = await request(harness.app)
        .post('/posts/' + POST_ID + '/comments')
        .set('Authorization', bearer(RoleType.USER))
        .send(VALID_COMMENT);

      expect(res.status).toBe(201);
      expect(res.text || '').toBe('');
      expect(res.headers['location']).toBe(
        '/posts/' + POST_ID + '/comments/' + COMMENT_ID,
      );
      expect(stubs.post.createCommentForPost).toHaveBeenCalledTimes(1);
    });

    it('GET /posts/:id/comments lists the comments of one post', async () => {
      const res = await probe('get', '/posts/' + POST_ID + '/comments');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { _id: COMMENT_ID, post: POST_ID, ...VALID_COMMENT },
      ]);
      expect(stubs.post.getAllCommentsOfPost).toHaveBeenCalledWith(POST_ID);
      // and it is not the `/:id` route answering with `id === 'comments'`
      expect(stubs.post.getPostById).not.toHaveBeenCalled();
    });

    it('POST /auth/login issues a token pair', async () => {
      const res = await request(harness.app)
        .post('/auth/login')
        .send({ username: 'tester', password: 'password' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        access_token: 'login-access',
        refresh_token: 'login-refresh',
      });
      expect(authServiceStub.validateUser).toHaveBeenCalledWith(
        'tester',
        'password',
      );
    });

    it('POST /auth/refresh issues a token pair', async () => {
      const res = await request(harness.app)
        .post('/auth/refresh')
        .send({ refresh_token: 'login-refresh' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        access_token: 'refreshed-access',
        refresh_token: 'refreshed-refresh',
      });
      expect(stubs.auth.refresh).toHaveBeenCalledTimes(1);
      expect(stubs.auth.refresh.mock.calls[0][0].refresh_token).toBe(
        'login-refresh',
      );
    });

    it('GET /profile returns the principal, from the root mount', async () => {
      const res = await request(harness.app)
        .get('/profile')
        .set('Authorization', bearer(RoleType.USER));

      expect(res.status).toBe(200);
      expect(res.body).toEqual(PRINCIPAL);
      expect(stubs.profile.getProfile).toHaveBeenCalledTimes(1);
    });

    it('GET /users/:id returns one user', async () => {
      const res = await probe('get', '/users/' + USER_ID);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ _id: USER_ID, username: 'tester' });
      expect(stubs.user.getUser).toHaveBeenCalledWith(USER_ID, false);
    });

    it('GET /users/:id honours ?withPosts=', async () => {
      const res = await request(harness.app)
        .get('/users/' + USER_ID)
        .query({ withPosts: 'true' });

      expect(res.status).toBe(200);
      expect(stubs.user.getUser).toHaveBeenCalledWith(USER_ID, true);
    });

    it('POST /register creates a user and points at it', async () => {
      const res = await request(harness.app)
        .post('/register')
        .send(VALID_REGISTRATION);

      expect(res.status).toBe(201);
      expect(res.text || '').toBe('');
      expect(res.headers['location']).toBe('/users/' + USER_ID);
      expect(stubs.register.register).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------
  // Neighbouring verbs and prefixes must stay silent.
  // ---------------------------------------------------------------------

  describe('a neighbouring method or prefix does not answer', () => {
    const unrouted: Array<[HttpMethod, string]> = [
      // the greeting is GET-only, and nothing else lives at the root
      ['post', '/'],
      ['put', '/'],
      ['delete', '/'],
      // /posts takes GET and POST on the collection, never PUT or DELETE
      ['put', '/posts'],
      ['delete', '/posts'],
      // ... and GET, PUT, DELETE on the item, never POST
      ['post', '/posts/' + POST_ID],
      // comments are POST and GET only
      ['put', '/posts/' + POST_ID + '/comments'],
      ['delete', '/posts/' + POST_ID + '/comments'],
      // the auth routes are POST-only
      ['get', '/auth/login'],
      ['put', '/auth/login'],
      ['get', '/auth/refresh'],
      ['delete', '/auth/refresh'],
      // the profile is read-only
      ['post', '/profile'],
      ['put', '/profile'],
      ['delete', '/profile'],
      // users are read-only, and only by id
      ['get', '/users'],
      ['post', '/users'],
      ['put', '/users/' + USER_ID],
      ['delete', '/users/' + USER_ID],
      // registration is POST-only, on the collection itself
      ['get', '/register'],
      ['put', '/register'],
      ['delete', '/register'],
      ['post', '/register/' + USER_ID],
      // the prefixes are exactly the six in `createApp`
      ['get', '/post'],
      ['get', '/post/' + POST_ID],
      ['get', '/user/' + USER_ID],
      ['get', '/profiles'],
      ['get', '/auth/profile'],
      ['get', '/posts/' + POST_ID + '/comment'],
      ['post', '/login'],
      ['post', '/refresh'],
      ['post', '/auth/register'],
    ];

    it.each(unrouted)(
      '%s %s reaches no route',
      async (method: HttpMethod, path: string) => {
        const res = await probe(method, path);

        expect(res.status).toBe(404);
        expect(res.body).toEqual({
          message: `Cannot ${method.toUpperCase()} ${path}`,
          error: 'Not Found',
          statusCode: 404,
        });
        // no route matched, so no route's throttler ran
        expectNotRateLimited(res.headers);
      },
    );

    it('no controller is reached by any unrouted probe', async () => {
      await Promise.all(unrouted.map(([method, path]) => probe(method, path)));

      const everyStub = [
        stubs.app.getHello,
        stubs.post.getAllPosts,
        stubs.post.getPostById,
        stubs.post.createPost,
        stubs.post.updatePost,
        stubs.post.deletePostById,
        stubs.post.createCommentForPost,
        stubs.post.getAllCommentsOfPost,
        stubs.auth.login,
        stubs.auth.refresh,
        stubs.profile.getProfile,
        stubs.user.getUser,
        stubs.register.register,
      ];
      everyStub.forEach((stub) => expect(stub).not.toHaveBeenCalled());
    });

    it('the profile router is mounted at the root, not under /users', async () => {
      const res = await request(harness.app)
        .get('/users/profile')
        .set('Authorization', bearer(RoleType.USER));

      // `/users/:id` swallows it and the object id pipe rejects it
      expect(res.status).toBe(400);
      expect(stubs.profile.getProfile).not.toHaveBeenCalled();
      expect(stubs.user.getUser).not.toHaveBeenCalled();
    });

    it('the app router does not swallow the other mounts', async () => {
      const res = await probe('get', '/posts');

      expect(res.status).toBe(200);
      expect(stubs.app.getHello).not.toHaveBeenCalled();
      expect(stubs.post.getAllPosts).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------
  // throttle -> jwt -> roles -> validation, in that order.
  // ---------------------------------------------------------------------

  describe('the middleware order inside a matched route', () => {
    it('POST /posts without a token answers 401 after the throttler ran', async () => {
      const res = await request(harness.app).post('/posts').send(VALID_POST);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
      expectRateLimited(res.headers);
      expect(stubs.post.createPost).not.toHaveBeenCalled();
    });

    it('DELETE /posts/:id with a USER token answers 403 after the throttler ran', async () => {
      const res = await request(harness.app)
        .delete('/posts/' + POST_ID)
        .set('Authorization', bearer(RoleType.USER))
        .send();

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        message: 'Forbidden resource',
        error: 'Forbidden',
        statusCode: 403,
      });
      expectRateLimited(res.headers);
      expect(stubs.post.deletePostById).not.toHaveBeenCalled();
    });

    it('POST /posts with a USER token and an invalid body answers 400 after the throttler ran', async () => {
      const res = await request(harness.app)
        .post('/posts')
        .set('Authorization', bearer(RoleType.USER))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(Array.isArray(res.body.message)).toBe(true);
      expectRateLimited(res.headers);
      expect(stubs.post.createPost).not.toHaveBeenCalled();
    });

    it('the jwt guard runs before the roles guard', async () => {
      // DELETE requires ADMIN; with no token at all the answer is the jwt
      // guard's 401 and never the roles guard's 403.
      const res = await request(harness.app)
        .delete('/posts/' + POST_ID)
        .send();

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
    });

    it('the roles guard runs before the validation pipe', async () => {
      // comments require USER; an ADMIN-only principal with a body that could
      // never validate is still refused on the role, not on the body.
      const res = await request(harness.app)
        .post('/posts/' + POST_ID + '/comments')
        .set('Authorization', bearer(RoleType.ADMIN))
        .send({});

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        message: 'Forbidden resource',
        error: 'Forbidden',
        statusCode: 403,
      });
      expect(stubs.post.createCommentForPost).not.toHaveBeenCalled();
    });

    it('the local guard is on /auth/login and not on /auth/refresh', async () => {
      const login = await request(harness.app).post('/auth/login').send({});

      expect(login.status).toBe(401);
      expect(login.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
      expectRateLimited(login.headers);
      expect(stubs.auth.login).not.toHaveBeenCalled();

      const refresh = await request(harness.app).post('/auth/refresh').send({});

      // no guard, so the refresh route gets as far as its payload pipe
      expect(refresh.status).toBe(400);
      expect(refresh.body.error).toBe('Bad Request');
      expect(stubs.auth.refresh).not.toHaveBeenCalled();
    });

    it('GET /profile is guarded by jwt', async () => {
      const res = await probe('get', '/profile');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Unauthorized', statusCode: 401 });
      expectRateLimited(res.headers);
      expect(stubs.profile.getProfile).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // Which routes carry which guards.
  // ---------------------------------------------------------------------

  describe('the guard set of each protected route', () => {
    const protectedRoutes: Array<[string, HttpMethod, string, RoleType[]]> = [
      ['POST /posts', 'post', '/posts', [RoleType.USER, RoleType.ADMIN]],
      [
        'PUT /posts/:id',
        'put',
        '/posts/' + POST_ID,
        [RoleType.USER, RoleType.ADMIN],
      ],
      ['DELETE /posts/:id', 'delete', '/posts/' + POST_ID, [RoleType.ADMIN]],
      [
        'POST /posts/:id/comments',
        'post',
        '/posts/' + POST_ID + '/comments',
        [RoleType.USER],
      ],
    ];

    it.each(protectedRoutes)(
      '%s rejects an unauthenticated caller',
      async (_label: string, method: HttpMethod, path: string) => {
        const res = await probe(method, path);

        expect(res.status).toBe(401);
        expectRateLimited(res.headers);
      },
    );

    it.each(protectedRoutes)(
      '%s rejects a principal holding neither role',
      async (_label: string, method: HttpMethod, path: string) => {
        const agent = probe(method, path).set('Authorization', bearer());
        const res = await agent.send(VALID_POST);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          message: 'Forbidden resource',
          error: 'Forbidden',
          statusCode: 403,
        });
      },
    );

    it('POST /posts admits USER and ADMIN alike', async () => {
      for (const role of [RoleType.USER, RoleType.ADMIN]) {
        const fresh = buildApp(createStubs());
        const res = await request(fresh.app)
          .post('/posts')
          .set('Authorization', bearer(role))
          .send(VALID_POST);
        fresh.throttlerStorage.onApplicationShutdown();

        expect(res.status).toBe(201);
      }
    });

    it('PUT /posts/:id admits USER and ADMIN alike', async () => {
      for (const role of [RoleType.USER, RoleType.ADMIN]) {
        const fresh = buildApp(createStubs());
        const res = await request(fresh.app)
          .put('/posts/' + POST_ID)
          .set('Authorization', bearer(role))
          .send(VALID_POST);
        fresh.throttlerStorage.onApplicationShutdown();

        expect(res.status).toBe(204);
      }
    });

    it('DELETE /posts/:id admits ADMIN only', async () => {
      const asUser = await request(harness.app)
        .delete('/posts/' + POST_ID)
        .set('Authorization', bearer(RoleType.USER))
        .send();
      expect(asUser.status).toBe(403);

      const asAdmin = await request(harness.app)
        .delete('/posts/' + POST_ID)
        .set('Authorization', bearer(RoleType.ADMIN))
        .send();
      expect(asAdmin.status).toBe(204);
    });

    it('POST /posts/:id/comments admits USER only', async () => {
      const asAdmin = await request(harness.app)
        .post('/posts/' + POST_ID + '/comments')
        .set('Authorization', bearer(RoleType.ADMIN))
        .send(VALID_COMMENT);
      expect(asAdmin.status).toBe(403);

      const asUser = await request(harness.app)
        .post('/posts/' + POST_ID + '/comments')
        .set('Authorization', bearer(RoleType.USER))
        .send(VALID_COMMENT);
      expect(asUser.status).toBe(201);
    });

    const openRoutes: Array<[HttpMethod, string]> = [
      ['get', '/'],
      ['get', '/posts'],
      ['get', '/posts/' + POST_ID],
      ['get', '/posts/' + POST_ID + '/comments'],
      ['get', '/users/' + USER_ID],
    ];

    it.each(openRoutes)(
      '%s %s carries no guard',
      async (method: HttpMethod, path: string) => {
        const res = await probe(method, path);

        expect(res.status).toBe(200);
      },
    );
  });

  // ---------------------------------------------------------------------
  // The throttler is keyed per handler, not per application.
  // ---------------------------------------------------------------------

  describe('the throttler is scoped to a single handler', () => {
    it('spends one allowance per handler', async () => {
      const first = await probe('get', '/');
      const second = await probe('get', '/');
      const other = await probe('get', '/posts');

      const limit = THROTTLER_OPTIONS.limit;
      expect(first.headers['x-ratelimit-remaining']).toBe(String(limit - 1));
      expect(second.headers['x-ratelimit-remaining']).toBe(String(limit - 2));
      // a different handler starts from its own allowance
      expect(other.headers['x-ratelimit-remaining']).toBe(String(limit - 1));
    });
  });
});
