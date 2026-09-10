import { LoggerService } from './logger/logger.service';

export class AppService {
  constructor(private readonly logger: LoggerService) {}

  getHello(): string {
    this.logger.log('Hello World');
    return 'Hello World!';
  }
}
