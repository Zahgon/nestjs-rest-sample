import { createMock } from '@golevelup/ts-jest';
import { AppService } from './app.service';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;
  let service: AppService;

  beforeEach(async () => {
    service = createMock<AppService>();
    appController = new AppController(service);
  });
  it('should be defined', () => {
    expect(appController).toBeDefined();
  });

  it('getHello', async () => {
    jest.spyOn(service, 'getHello').mockReturnValue('Hello');
    expect(appController.getHello()).toEqual('Hello');
  });
});
