import { createMock } from '@golevelup/ts-jest';
import { mock as jestMock, mockClear, MockProxy } from 'jest-mock-extended';
import { instance, mock, reset, verify, when } from 'ts-mockito';
import { RoleType } from '../../shared/enum/role-type.enum';
import { AuthenticatedRequest } from '../interface/authenticated-request.interface';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  beforeEach(async () => {
    guard = new RolesGuard([]);
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should skip(return true) if the `HasRoles` decorator is not set', async () => {
    const request = createMock<AuthenticatedRequest>();
    const result = guard.canActivate(request);

    expect(result).toBeTruthy();
  });

  it('should return true if the `HasRoles` decorator is set', async () => {
    guard = new RolesGuard([RoleType.USER]);
    const request = createMock<AuthenticatedRequest>({
      user: {
        username: 'hantsy',
        id: '_id',
        email: 'hantsy@example.com',
        roles: [RoleType.USER],
      },
    });

    const result = guard.canActivate(request);
    expect(result).toBeTruthy();
  });

  it('should return false if the `HasRoles` decorator is set but role is not allowed', async () => {
    guard = new RolesGuard([RoleType.ADMIN]);
    const request = createMock<AuthenticatedRequest>({
      user: {
        username: 'hantsy',
        id: '_id',
        email: 'hantsy@example.com',
        roles: [RoleType.USER],
      },
    });

    const result = guard.canActivate(request);
    expect(result).toBeFalsy();
  });
});

describe('RolesGuard(ts-mockito)', () => {
  let guard: RolesGuard;
  let request: AuthenticatedRequest;
  beforeEach(() => {
    request = mock<AuthenticatedRequest>();
  });

  afterEach(() => {
    reset(request);
  });

  it('should skip(return true) if the `HasRoles` decorator is not set', async () => {
    guard = new RolesGuard([] as RoleType[]);

    when(request.user).thenReturn({
      username: 'hantsy',
      id: '_id',
      email: 'hantsy@example.com',
      roles: [RoleType.USER],
    });

    const requestInstacne = instance(request);
    const result = guard.canActivate(requestInstacne);

    expect(result).toBeTruthy();
    verify(request.user).never();
  });

  it('should return true if the `HasRoles` decorator is set', async () => {
    guard = new RolesGuard([RoleType.USER] as RoleType[]);

    when(request.user).thenReturn({
      username: 'hantsy',
      id: '_id',
      email: 'hantsy@example.com',
      roles: [RoleType.USER],
    });

    const requestInstacne = instance(request);

    const result = guard.canActivate(requestInstacne);
    console.log(result);
    expect(result).toBeTruthy();
    verify(request.user).once();
  });

  it('should return false if the `HasRoles` decorator is set but role is not allowed', async () => {
    // but requires ADMIN
    guard = new RolesGuard([RoleType.ADMIN] as RoleType[]);

    // logged in as USER
    when(request.user).thenReturn({
      username: 'hantsy',
      id: '_id',
      email: 'hantsy@example.com',
      roles: [RoleType.USER],
    });

    const requestInstacne = instance(request);

    const result = guard.canActivate(requestInstacne);
    console.log(result);
    expect(result).toBeFalsy();
    verify(request.user).once();
  });
});

describe('RoelsGuard(jest-mock-extended)', () => {
  let guard: RolesGuard;
  let request: MockProxy<AuthenticatedRequest> & AuthenticatedRequest;

  beforeEach(() => {
    guard = new RolesGuard([]);
    request = jestMock<AuthenticatedRequest>();
  });

  afterEach(() => {
    mockClear(request);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should skip(return true) if the `HasRoles` decorator is not set', async () => {
    const result = guard.canActivate(request);

    expect(result).toBeTruthy();
  });

  it('should return true if the `HasRoles` decorator is set', async () => {
    guard = new RolesGuard([RoleType.USER]);
    request = jestMock<AuthenticatedRequest>({
      user: {
        username: 'hantsy',
        id: '_id',
        email: 'hantsy@example.com',
        roles: [RoleType.USER],
      },
    });

    const result = guard.canActivate(request);

    expect(result).toBeTruthy();
  });

  it('should return false if the `HasRoles` decorator is set but role is not allowed', async () => {
    // logged in as USER
    request = jestMock<AuthenticatedRequest>({
      user: {
        username: 'hantsy',
        id: '_id',
        email: 'hantsy@example.com',
        roles: [RoleType.USER],
      },
    });

    //but requires ADMIN
    guard = new RolesGuard([RoleType.ADMIN]);

    const result = guard.canActivate(request);

    expect(result).toBeFalsy();
  });
});
