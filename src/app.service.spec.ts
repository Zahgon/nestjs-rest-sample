import { AppService } from './app.service';
import { createLogger } from './logger/logger.providers';
import { LoggerService } from './logger/logger.service';

describe('AppService', () => {
  let logger: LoggerService;
  let service: AppService;

  beforeEach(async () => {
    logger = createLogger('AppService');
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);

    service = new AppService(logger);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getHello should return greeting and log it', () => {
    const result = service.getHello();
    expect(result).toEqual('Hello World!');
    expect(logger.log).toHaveBeenCalledWith('Hello World');
  });
});
