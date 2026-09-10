import { createMock } from '@golevelup/ts-jest';
import { ClientResponse } from '@sendgrid/mail';
import { lastValueFrom, of } from 'rxjs';

import { User, UserModel } from '../database/user.model';
import { SendgridService } from '../sendgrid/sendgrid.service';
import { RoleType } from '../shared/enum/role-type.enum';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let model: UserModel;
  let sendgrid: SendgridService;
  let findOneFn: jest.Mock;
  let existsFn: jest.Mock;
  let createFn: jest.Mock;

  beforeEach(async () => {
    findOneFn = jest.fn();
    existsFn = jest.fn();
    createFn = jest.fn();

    const modelMock: Partial<UserModel> = {
      findOne: findOneFn,
      exists: existsFn,
      create: createFn,
    };
    model = modelMock as UserModel;
    sendgrid = createMock<SendgridService>({
      send: jest.fn(),
    });

    service = new UserService(model, sendgrid);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('save ', async () => {
    const sampleData = {
      username: 'hantsy',
      email: 'hantsy@example.com',
      firstName: 'hantsy',
      lastName: 'bai',
      password: 'mysecret',
    };

    const msg = {
      from: 'service@example.com', // Use the email address or domain you verified above
      subject: 'Welcome to Nestjs Sample',
      templateId: 'welcome',
      personalizations: [
        {
          to: 'hantsy@example.com',
          dynamicTemplateData: { name: 'hantsy bai' },
        },
      ],
    };

    const saveSpy = createFn.mockImplementation(() =>
      Promise.resolve({
        _id: '123',
        ...sampleData,
      }),
    );

    jest.spyOn(sendgrid, 'send').mockImplementation(() => {
      return of<[ClientResponse, {}]>([createMock<ClientResponse>(), {}]);
    });

    const result = await lastValueFrom(service.register(sampleData));
    expect(saveSpy).toHaveBeenCalledWith({
      ...sampleData,
      roles: [RoleType.USER],
    });
    expect(result._id).toBeDefined();
    //expect(sendSpy).toBeCalledWith(msg);
    //expect(pipeSpy).toBeCalled();
  });

  it('findByUsername should return user', async () => {
    findOneFn.mockImplementation(() => ({
      exec: jest.fn().mockResolvedValue({
        username: 'hantsy',
        email: 'hantsy@example.com',
      } as User),
    }));

    const foundUser = await lastValueFrom(service.findByUsername('hantsy'));
    expect(foundUser).toEqual({
      username: 'hantsy',
      email: 'hantsy@example.com',
    });
    expect(model.findOne).toHaveBeenLastCalledWith({ username: 'hantsy' });
    expect(model.findOne).toHaveBeenCalledTimes(1);
  });

  it('findByUsername should return null if not found', async () => {
    findOneFn.mockImplementation(() => ({
      exec: jest.fn().mockResolvedValue(null),
    }));
    try {
      const foundUser = await lastValueFrom(service.findByUsername('hantsy'));
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  describe('findById', () => {
    it('return one result', async () => {
      findOneFn.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue({
          username: 'hantsy',
          email: 'hantsy@example.com',
        } as User),
      }));

      const foundUser = await lastValueFrom(service.findById('hantsy'));
      expect(foundUser).toEqual({
        username: 'hantsy',
        email: 'hantsy@example.com',
      });
      expect(model.findOne).toHaveBeenLastCalledWith({ _id: 'hantsy' });
      expect(model.findOne).toHaveBeenCalledTimes(1);
    });

    it('return a null result', async () => {
      findOneFn.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(null),
      }));

      try {
        const foundUser = await lastValueFrom(service.findById('hantsy'));
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    it('parameter withPosts=true', async () => {
      findOneFn.mockImplementation(() => ({
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue({
          username: 'hantsy',
          email: 'hantsy@example.com',
        } as User),
      }));

      const foundUser = await lastValueFrom(service.findById('hantsy', true));
      expect(foundUser).toEqual({
        username: 'hantsy',
        email: 'hantsy@example.com',
      });
      expect(model.findOne).toHaveBeenLastCalledWith({ _id: 'hantsy' });
      expect(model.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('existsByUsername', () => {
    it('should return true if exists ', async () => {
      const existsSpy = existsFn.mockImplementation(() => {
        return {
          exec: jest.fn().mockResolvedValue({
            _id: 'test',
          }),
        };
      });
      const result = await lastValueFrom(service.existsByUsername('hantsy'));

      expect(existsSpy).toHaveBeenCalledWith({ username: 'hantsy' });
      expect(existsSpy).toHaveBeenCalledTimes(1);
      expect(result).toBeTruthy();
    });

    it('should return false if not exists ', async () => {
      const existsSpy = existsFn.mockImplementation(() => {
        return {
          exec: jest.fn().mockResolvedValue(null),
        };
      });
      const result = await lastValueFrom(service.existsByUsername('hantsy'));

      expect(existsSpy).toHaveBeenCalledWith({ username: 'hantsy' });
      expect(existsSpy).toHaveBeenCalledTimes(1);
      expect(result).toBeFalsy();
    });
  });

  describe('existsByEmail', () => {
    it('should return true if exists ', async () => {
      const existsSpy = existsFn.mockImplementation(() => {
        return {
          exec: jest.fn().mockResolvedValue({
            _id: 'test',
          }),
        };
      });
      const result = await lastValueFrom(
        service.existsByEmail('hantsy@example.com'),
      );

      expect(existsSpy).toHaveBeenCalledWith({ email: 'hantsy@example.com' });
      expect(existsSpy).toHaveBeenCalledTimes(1);
      expect(result).toBeTruthy();
    });

    it('should return false if not exists ', async () => {
      const existsSpy = existsFn.mockImplementation(() => {
        return {
          exec: jest.fn().mockResolvedValue(null),
        };
      });
      const result = await lastValueFrom(
        service.existsByEmail('hantsy@example.com'),
      );

      expect(existsSpy).toHaveBeenCalledWith({ email: 'hantsy@example.com' });
      expect(existsSpy).toHaveBeenCalledTimes(1);
      expect(result).toBeFalsy();
    });
  });
});
