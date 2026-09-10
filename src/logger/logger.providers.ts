// src/logger/logger.provider.ts

import { LoggerService } from './logger.service';

export function loggerFactory(logger: LoggerService, prefix: string) {
  if (prefix) {
    logger.setPrefix(prefix);
  }
  return logger;
}

export function createLogger(prefix = ''): LoggerService {
  return loggerFactory(new LoggerService(), prefix);
}
