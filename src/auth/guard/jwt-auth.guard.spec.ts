import { createMock } from '@golevelup/ts-jest';
import { Request, Response } from 'express';
import { AuthGuard } from '../../core/auth-guard';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('LocalAuthGuard', () => {
  let guard: JwtAuthGuard;
  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should return true for `canActivate`', async () => {
    const canActivate = AuthGuard.prototype.canActivate;
    AuthGuard.prototype.canActivate = jest.fn(() => Promise.resolve(true));
    try {
      expect(
        await guard.canActivate(createMock<Request>(), createMock<Response>()),
      ).toBeTruthy();
    } finally {
      AuthGuard.prototype.canActivate = canActivate;
    }
  });

  it('handleRequest: error', async () => {
    const error = { name: 'test', message: 'error' } as Error;

    try {
      guard.handleRequest(error, {}, {});
    } catch (e) {
      //console.log(e);
      expect(e).toEqual(error);
    }
  });

  it('handleRequest', async () => {
    expect(
      await guard.handleRequest(undefined, { username: 'hantsy' }, undefined),
    ).toEqual({ username: 'hantsy' });
  });

  it('handleRequest: Unauthorized', async () => {
    try {
      guard.handleRequest(undefined, undefined, undefined);
    } catch (e) {
      // console.log(e);
      expect(e).toBeDefined();
    }
  });
});
