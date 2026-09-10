import { Request } from 'express';
import passport from 'passport';
import { Connection } from 'mongoose';

import jwtConfig, { JwtConfig } from './config/jwt.config';
import mongodbConfig from './config/mongodb.config';
import sendgridConfig from './config/sendgrid.config';

import { createDatabaseConnection } from './database/database-connection.providers';
import {
  createDatabaseModels,
  DatabaseModels,
} from './database/database-models.providers';
import {
  COMMENT_MODEL,
  POST_MODEL,
  USER_MODEL,
} from './database/database.constants';

import { createLogger } from './logger/logger.providers';
import { createMailService } from './sendgrid/sendgrid.providers';
import { SendgridService } from './sendgrid/sendgrid.service';

import { JwtService } from './core/jwt.service';
import { ThrottlerGuard, ThrottlerStorageService } from './core/throttler';
import { ValidationPipe } from './core/validation';
import { RouteDeps } from './core/route';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthenticatedRequest } from './auth/interface/authenticated-request.interface';
import { JwtStrategy } from './auth/strategy/jwt.strategy';
import { LocalStrategy } from './auth/strategy/local.strategy';

import { PostController } from './post/post.controller';
import { PostDataInitializerService } from './post/post-data-initializer.service';
import { PostService } from './post/post.service';

import { ProfileController } from './user/profile.controller';
import { RegisterController } from './user/register.controller';
import { UserController } from './user/user.controller';
import { UserDataInitializerService } from './user/user-data-initializer.service';
import { UserService } from './user/user.service';

/**
 * Everything the application is wired from. Built once at start-up, apart from
 * `createPostController`, which hands back a fresh instance per request because
 * the post service stamps documents with the calling principal.
 */
export interface Container {
  connection: Connection;
  models: DatabaseModels;
  throttler: ThrottlerGuard;
  throttlerStorage: ThrottlerStorageService;
  routeDeps: RouteDeps;
  appController: AppController;
  authController: AuthController;
  profileController: ProfileController;
  registerController: RegisterController;
  userController: UserController;
  createPostController: (req: Request) => PostController;
  onModuleInit: () => Promise<void>;
  close: () => Promise<void>;
}

export interface ContainerOptions {
  validationPipe: ValidationPipe;
}

export const createContainer = ({
  validationPipe,
}: ContainerOptions): Container => {
  const jwtConf: JwtConfig = jwtConfig();

  const connection = createDatabaseConnection(mongodbConfig());
  const models = createDatabaseModels(connection);

  const sendgridService = new SendgridService(
    createMailService(sendgridConfig()),
  );
  const userService = new UserService(models[USER_MODEL], sendgridService);
  const jwtService = new JwtService({
    secret: jwtConf.secretKey,
    signOptions: { expiresIn: jwtConf.expiresIn },
  });
  const authService = new AuthService(userService, jwtService, jwtConf);

  passport.use(new JwtStrategy(jwtConf));
  passport.use(new LocalStrategy(authService));

  const throttlerStorage = new ThrottlerStorageService();
  const throttler = new ThrottlerGuard(
    { ttl: 60000, limit: 10 },
    throttlerStorage,
  );
  const routeDeps: RouteDeps = { throttler, validationPipe };

  const appController = new AppController(
    new AppService(createLogger('AppService')),
  );
  const authController = new AuthController(authService);
  const profileController = new ProfileController();
  const registerController = new RegisterController(userService);
  const userController = new UserController(userService);

  const createPostController = (req: Request): PostController =>
    new PostController(
      new PostService(
        models[POST_MODEL],
        models[COMMENT_MODEL],
        req as AuthenticatedRequest,
      ),
    );

  const userDataInitializerService = new UserDataInitializerService(
    models[USER_MODEL],
  );
  const postDataInitializerService = new PostDataInitializerService(
    models[POST_MODEL],
    models[COMMENT_MODEL],
  );

  return {
    connection,
    models,
    throttler,
    throttlerStorage,
    routeDeps,
    appController,
    authController,
    profileController,
    registerController,
    userController,
    createPostController,
    onModuleInit: async (): Promise<void> => {
      await connection.asPromise();
      await postDataInitializerService.onModuleInit();
      await userDataInitializerService.onModuleInit();
    },
    close: async (): Promise<void> => {
      throttlerStorage.onApplicationShutdown();
      await connection.close();
    },
  };
};
