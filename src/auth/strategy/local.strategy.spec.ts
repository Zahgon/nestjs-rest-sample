import { mock, MockProxy } from 'jest-mock-extended';
import { EMPTY, of, throwError } from 'rxjs';
import { RoleType } from '../../shared/enum/role-type.enum';
import { AuthService } from '../auth.service';
import { LocalStrategy } from './local.strategy';

type VerifyCallback = (
  username: string,
  password: string,
  done: (error: unknown, user: unknown) => void,
) => void;

// passport-local stores the callback given to `super` as `_verify` and invokes
// it as `this._verify(username, password, verified)`, so `this` is the strategy.
const verifyOf = (strategy: LocalStrategy): VerifyCallback =>
  (strategy as unknown as { _verify: VerifyCallback })._verify;

const spyDone = (): { done: jest.Mock; called: Promise<void> } => {
  let settle!: () => void;
  const called = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { done: jest.fn(() => settle()), called };
};

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let authService: MockProxy<AuthService> & AuthService;
  beforeEach(async () => {
    authService = mock<AuthService>();

    strategy = new LocalStrategy(authService);
  });

  describe('validate', () => {
    it('should return user principal if user and password is provided ', async () => {
      authService.validateUser.mockImplementation(
        (user: string, pass: string) => {
          return of({
            username: 'test',
            id: '_id',
            email: 'hantsy@example.com',
            roles: [RoleType.USER],
          });
        },
      );
      const user = await strategy.validate('test', 'pass');
      expect(user.username).toEqual('test');
      expect(authService.validateUser).toHaveBeenCalledWith('test', 'pass');
    });

    it('should throw UnauthorizedException  if user is not valid ', async () => {
      authService.validateUser.mockImplementation(
        (user: string, pass: string) => {
          return EMPTY;
        },
      );

      try {
        const user = await strategy.validate('test', 'pass');
      } catch (e) {
        //console.log(e)
        expect(e).toBeDefined();
      }
      expect(authService.validateUser).toHaveBeenCalledWith('test', 'pass');
    });

    it('should pass the user principal to done', async () => {
      const principal = {
        username: 'test',
        id: '_id',
        email: 'hantsy@example.com',
        roles: [RoleType.USER],
      };
      authService.validateUser.mockImplementation(
        (user: string, pass: string) => {
          return of(principal);
        },
      );
      const { done, called } = spyDone();

      verifyOf(strategy).call(strategy, 'test', 'pass', done);
      await called;

      expect(authService.validateUser).toHaveBeenCalledWith('test', 'pass');
      expect(done).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledWith(null, principal);
    });

    it('should pass the rejection to done', async () => {
      const rejection = new Error('invalid credentials');
      authService.validateUser.mockImplementation(
        (user: string, pass: string) => {
          return throwError(() => rejection);
        },
      );
      const { done, called } = spyDone();

      verifyOf(strategy).call(strategy, 'test', 'pass', done);
      await called;

      expect(authService.validateUser).toHaveBeenCalledWith('test', 'pass');
      expect(done).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledWith(rejection, null);
    });
  });
});

describe('LocalStrategy(call supper)', () => {
  let local: any;
  let parentMock: any;

  beforeEach(() => {
    local = Object.getPrototypeOf(LocalStrategy);
    parentMock = jest.fn();
    Object.setPrototypeOf(LocalStrategy, parentMock);
  });

  afterEach(() => {
    Object.setPrototypeOf(LocalStrategy, local);
  });

  it('call super', () => {
    new LocalStrategy(mock<AuthService>());
    expect(parentMock.mock.calls.length).toBe(1);
    expect(parentMock).toHaveBeenCalledWith(
      {
        usernameField: 'username',
        passwordField: 'password',
      },
      expect.any(Function),
    );
  });
});
