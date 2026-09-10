import { createMock } from '@golevelup/ts-jest';
import { lastValueFrom, of } from 'rxjs';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './interface/authenticated-request.interface';
import { UserPrincipal } from './interface/user-principal.interface';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    authService = createMock<AuthService>();

    controller = new AuthController(authService);
  });

  describe('login', () => {
    it('should return tokens', async () => {
      jest
        .spyOn(authService, 'login')
        .mockImplementation((user: UserPrincipal) =>
          of({ access_token: 'jwttoken', refresh_token: 'refreshtoken' }),
        );

      const token = await lastValueFrom(
        controller.login(
          createMock<AuthenticatedRequest>({
            user: { id: '1', username: 'test' },
          }),
        ),
      );
      expect(token.access_token).toBe('jwttoken');
      expect(token.refresh_token).toBe('refreshtoken');
      expect(authService.login).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should return new tokens', async () => {
      jest
        .spyOn(authService, 'refreshToken')
        .mockImplementation((token: string) =>
          of({ access_token: 'newtoken', refresh_token: 'newrefresh' }),
        );

      const result = await lastValueFrom(
        controller.refresh({ refresh_token: 'oldrefreshtoken' }),
      );
      expect(result.access_token).toBe('newtoken');
      expect(result.refresh_token).toBe('newrefresh');
      expect(authService.refreshToken).toHaveBeenCalledWith('oldrefreshtoken');
    });
  });
});
