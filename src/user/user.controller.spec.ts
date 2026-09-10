import { createMock } from '@golevelup/ts-jest';
import { Types } from 'mongoose';
import { User } from '../database/user.model';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { lastValueFrom, of } from 'rxjs';

describe('UserController', () => {
  let controller: UserController;
  let service: UserService;
  beforeEach(async () => {
    service = createMock<UserService>();
    controller = new UserController(service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getUser', async () => {
    jest
      .spyOn(service, 'findById')
      .mockImplementationOnce((id: string, withPosts: boolean = false) =>
        of<User>({
          _id: new Types.ObjectId(),
          username: 'hantsy',
          password: 'mysecret',
          email: 'hantsy@example.com',
          firstName: 'hantsy',
          lastName: 'bai',
        }),
      );
    const user = await lastValueFrom(controller.getUser('id', false));
    expect(user.firstName).toBe('hantsy');
    expect(user.lastName).toBe('bai');
    expect(service.findById).toHaveBeenCalledWith('id', false);
  });
});
