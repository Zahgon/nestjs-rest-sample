import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(async () => {
    service = new LoggerService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('log', () => {
    const consoleSpy = jest.spyOn(global.console, 'log');
    service.log('hello');
    expect(consoleSpy).toHaveBeenCalledWith('hello');
  });

  it('log with prefix', () => {
    const consoleSpy = jest.spyOn(global.console, 'log');
    service.setPrefix('H');
    service.log('hello');
    expect(consoleSpy).toHaveBeenCalledWith('[H] hello');
  });
});
