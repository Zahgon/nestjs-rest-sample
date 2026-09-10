import { createMock } from '@golevelup/ts-jest';
import { Response } from 'express';
import { RegisterController } from './register.controller';
import { UserService } from './user.service';
import { of } from 'rxjs';
import { User } from 'database/user.model';
import { RegisterDto } from './register.dto';

describe('Register Controller', () => {
  let controller: RegisterController;
  let service: UserService;

  beforeEach(async () => {
    service = createMock<UserService>();
    controller = new RegisterController(service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should throw ConflictException when username is existed ', async () => {
      const existsByUsernameSpy = jest
        .spyOn(service, 'existsByUsername')
        .mockReturnValue(of(true));
      const existsByEmailSpy = jest
        .spyOn(service, 'existsByEmail')
        .mockReturnValue(of(true));
      const saveSpy = jest
        .spyOn(service, 'register')
        .mockReturnValue(of({} as User));

      const responseMock = createMock<Response>({
        location: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      });
      try {
        await controller.register(
          { username: 'hantsy' } as RegisterDto,
          responseMock,
        );
      } catch (e) {
        expect(e).toBeDefined();
        expect(existsByUsernameSpy).toHaveBeenCalledWith('hantsy');
        expect(existsByEmailSpy).toHaveBeenCalledTimes(0);
        expect(saveSpy).toHaveBeenCalledTimes(0);
      }
    });

    it('should throw ConflictException when email is existed ', async () => {
      const existsByUsernameSpy = jest
        .spyOn(service, 'existsByUsername')
        .mockReturnValue(of(false));
      const existsByEmailSpy = jest
        .spyOn(service, 'existsByEmail')
        .mockReturnValue(of(true));
      const saveSpy = jest
        .spyOn(service, 'register')
        .mockReturnValue(of({} as User));

      const responseMock = createMock<Response>({
        location: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      });
      try {
        await controller.register(
          { username: 'hantsy', email: 'hantsy@example.com' } as RegisterDto,
          responseMock,
        );
      } catch (e) {
        expect(e).toBeDefined();
        expect(existsByUsernameSpy).toHaveBeenCalledWith('hantsy');
        expect(existsByEmailSpy).toHaveBeenCalledWith('hantsy@example.com');
        expect(saveSpy).toHaveBeenCalledTimes(0);
      }
    });

    it('should save when username and email are available ', async () => {
      const existsByUsernameSpy = jest
        .spyOn(service, 'existsByUsername')
        .mockReturnValue(of(false));
      const existsByEmailSpy = jest
        .spyOn(service, 'existsByEmail')
        .mockReturnValue(of(false));
      const saveSpy = jest
        .spyOn(service, 'register')
        .mockReturnValue(of({ _id: '123' } as unknown as User));

      const responseMock = createMock<Response>({
        location: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      });

      const locationSpy = jest.spyOn(responseMock, 'location');
      const statusSpy = jest.spyOn(responseMock, 'status');
      const sendSpy = jest.spyOn(responseMock, 'send');

      await controller.register(
        { username: 'hantsy', email: 'hantsy@example.com' } as RegisterDto,
        responseMock,
      );

      expect(existsByUsernameSpy).toHaveBeenCalledWith('hantsy');
      expect(existsByEmailSpy).toHaveBeenCalledWith('hantsy@example.com');
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(locationSpy).toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalled();
      expect(sendSpy).toHaveBeenCalled();
    });
  });
});
