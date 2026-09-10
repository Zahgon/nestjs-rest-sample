import compression from 'compression';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';

import { createAppRouter } from './app.controller';
import { createAuthRouter } from './auth/auth.controller';
import { errorHandler, notFoundHandler } from './core/exception-filter';
import { createPostRouter } from './post/post.controller';
import { createProfileRouter } from './user/profile.controller';
import { createRegisterRouter } from './user/register.controller';
import { createUserRouter } from './user/user.controller';
import { setupSwagger } from './swagger';
import { Container } from './container';

/**
 * Assembles the HTTP pipeline.
 *
 * The order below is not cosmetic. CORS runs first, so a preflight is answered
 * before any other layer contributes headers; helmet and compression follow;
 * the API documentation is mounted ahead of the body parsers because it needs
 * none; the parsers come next, so a malformed payload fails before any route
 * is reached; the routers follow; and the not-found and error handlers close
 * the stack.
 */
export const createApp = (container: Container): Express => {
  const app = express();

  app.use(cors());
  app.use(helmet());
  app.use(compression());

  setupSwagger(app);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/', createAppRouter(container.appController, container.routeDeps));
  app.use(
    '/posts',
    createPostRouter(container.createPostController, container.routeDeps),
  );
  app.use(
    '/auth',
    createAuthRouter(container.authController, container.routeDeps),
  );
  app.use(
    '/',
    createProfileRouter(container.profileController, container.routeDeps),
  );
  app.use(
    '/users',
    createUserRouter(container.userController, container.routeDeps),
  );
  app.use(
    '/register',
    createRegisterRouter(container.registerController, container.routeDeps),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
