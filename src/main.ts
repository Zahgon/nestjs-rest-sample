import 'reflect-metadata';

import { Server } from 'http';

import { createApp } from './app';
import { createContainer } from './container';
import { ValidationPipe } from './core/validation';
import { validationSchema } from './config/validation';

/**
 * Validates the process environment against the schema and writes back every
 * value the schema supplied a default for, without overwriting anything the
 * environment already carries.
 */
export const loadEnvironment = (): void => {
  const { error, value } = validationSchema.validate(process.env, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }

  Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !(key in process.env))
    .forEach(([key, item]) => {
      process.env[key] = String(item);
    });
};

async function bootstrap(): Promise<void> {
  loadEnvironment();

  const container = createContainer({
    validationPipe: new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  });

  await container.onModuleInit();

  const app = createApp(container);
  const server: Server = app.listen(process.env.PORT ?? 3000);

  const shutdown = (): void => {
    server.close(() => {
      void container.close();
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGQUIT', shutdown);
}

void bootstrap();
