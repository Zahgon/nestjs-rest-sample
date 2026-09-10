import { Request, Response } from 'express';
import { AuthGuard } from '../../core/auth-guard';
import { LocalAuthGuard } from './local-auth.guard';

describe('LocalAuthGuard', () => {
  let guard: LocalAuthGuard;
  beforeEach(() => {
    guard = new LocalAuthGuard();
  });
  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
  it('should return true for `canActivate`', async () => {
    const canActivate = AuthGuard.prototype.canActivate;
    AuthGuard.prototype.canActivate = jest.fn(() => Promise.resolve(true));
    try {
      expect(await guard.canActivate({} as Request, {} as Response)).toBe(true);
    } finally {
      AuthGuard.prototype.canActivate = canActivate;
    }
  });
});
