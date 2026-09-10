import * as jwt from 'jsonwebtoken';
import { JwtService } from './jwt.service';

const ACCESS_SECRET = 'access-secret';
const REFRESH_SECRET = 'refresh-secret';

const secondsFromNow = (offset: number): number =>
  Math.floor(Date.now() / 1000) + offset;

const decode = (token: string): jwt.JwtPayload =>
  jwt.decode(token) as jwt.JwtPayload;

const lifetimeInSecondsOf = (token: string): number => {
  const { exp, iat } = decode(token);
  expect(exp).toBeDefined();
  expect(iat).toBeDefined();
  return (exp ?? 0) - (iat ?? 0);
};

/**
 * The access and refresh tokens are signed by the same service instance but
 * with different keys, so the precedence between the per-call secret and the
 * one the service was constructed with is load-bearing: get it backwards and
 * a refresh token still looks valid to the access-token verifier.
 */
describe('JwtService', () => {
  describe('signing with the constructor secret', () => {
    const service = new JwtService({
      secret: ACCESS_SECRET,
      signOptions: { expiresIn: '1h' },
    });

    it('round-trips a payload through sign and verify', async () => {
      const token = await service.signAsync({ sub: 'hantsy', roles: ['USER'] });
      const payload = await service.verifyAsync<jwt.JwtPayload>(token);

      expect(payload.sub).toBe('hantsy');
      expect(payload.roles).toEqual(['USER']);
    });

    it('applies the lifetime the service was constructed with', async () => {
      const token = await service.signAsync({ sub: 'hantsy' });

      expect(lifetimeInSecondsOf(token)).toBe(3600);
    });

    it('lets a per-call lifetime override the constructed one', async () => {
      const token = await service.signAsync(
        { sub: 'hantsy' },
        { expiresIn: '2h' },
      );

      expect(lifetimeInSecondsOf(token)).toBe(7200);
    });

    it('carries the other constructed sign options through', async () => {
      const withIssuer = new JwtService({
        secret: ACCESS_SECRET,
        signOptions: { issuer: 'nestjs-sample' },
      });

      const payload = decode(await withIssuer.signAsync({ sub: 'hantsy' }));

      expect(payload.iss).toBe('nestjs-sample');
      expect(payload.exp).toBeUndefined();
    });

    it('leaves a token unexpiring when no lifetime was configured anywhere', async () => {
      const noExpiry = new JwtService({ secret: ACCESS_SECRET });

      const payload = decode(await noExpiry.signAsync({ sub: 'hantsy' }));

      expect(payload.exp).toBeUndefined();
      expect(payload.iat).toBeDefined();
    });
  });

  describe('the per-call secret takes precedence', () => {
    const service = new JwtService({
      secret: ACCESS_SECRET,
      signOptions: { expiresIn: '1h' },
    });

    it('does not accept a refresh-signed token against the access secret', async () => {
      const refreshToken = await service.signAsync(
        { sub: 'hantsy' },
        { secret: REFRESH_SECRET, expiresIn: '7d' },
      );

      await expect(service.verifyAsync(refreshToken)).rejects.toThrow(
        jwt.JsonWebTokenError,
      );
      await expect(service.verifyAsync(refreshToken)).rejects.toThrow(
        'invalid signature',
      );
    });

    it('accepts a refresh-signed token against the refresh secret', async () => {
      const refreshToken = await service.signAsync(
        { sub: 'hantsy' },
        { secret: REFRESH_SECRET, expiresIn: '7d' },
      );

      const payload = await service.verifyAsync<jwt.JwtPayload>(refreshToken, {
        secret: REFRESH_SECRET,
      });

      expect(payload.sub).toBe('hantsy');
      expect(lifetimeInSecondsOf(refreshToken)).toBe(604800);
    });

    it('does not accept an access-signed token against the refresh secret', async () => {
      const accessToken = await service.signAsync({ sub: 'hantsy' });

      await expect(
        service.verifyAsync(accessToken, { secret: REFRESH_SECRET }),
      ).rejects.toThrow('invalid signature');
    });

    it('works with no constructed secret at all when every call supplies one', async () => {
      const bare = new JwtService();

      const token = await bare.signAsync(
        { sub: 'hantsy' },
        { secret: REFRESH_SECRET },
      );
      const payload = await bare.verifyAsync<jwt.JwtPayload>(token, {
        secret: REFRESH_SECRET,
      });

      expect(payload.sub).toBe('hantsy');
    });
  });

  describe('rejections', () => {
    const service = new JwtService({ secret: ACCESS_SECRET });

    it('rejects an expired token', async () => {
      const token = await service.signAsync({
        sub: 'hantsy',
        exp: secondsFromNow(-60),
      });

      await expect(service.verifyAsync(token)).rejects.toThrow(
        jwt.TokenExpiredError,
      );
      await expect(service.verifyAsync(token)).rejects.toThrow('jwt expired');
    });

    it('rejects a malformed token', async () => {
      await expect(service.verifyAsync('not-a-jwt')).rejects.toThrow(
        jwt.JsonWebTokenError,
      );
      await expect(service.verifyAsync('not-a-jwt')).rejects.toThrow(
        'jwt malformed',
      );
    });

    it('rejects a token whose signature was tampered with', async () => {
      const token = await service.signAsync({ sub: 'hantsy' });
      const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

      await expect(service.verifyAsync(tampered)).rejects.toThrow(
        'invalid signature',
      );
    });

    it('honours the verify options it was given', async () => {
      const token = await service.signAsync(
        { sub: 'hantsy' },
        { audience: 'api' },
      );

      await expect(
        service.verifyAsync(token, { audience: 'admin' }),
      ).rejects.toThrow(jwt.JsonWebTokenError);
      await expect(
        service.verifyAsync<jwt.JwtPayload>(token, { audience: 'api' }),
      ).resolves.toMatchObject({ sub: 'hantsy', aud: 'api' });
    });

    it('surfaces a signing failure as a rejected promise', async () => {
      // `exp` in the payload and `expiresIn` in the options are mutually
      // exclusive; the library reports it through the callback, which is the
      // only way `signAsync` can fail.
      await expect(
        service.signAsync(
          { sub: 'hantsy', exp: secondsFromNow(60) },
          { expiresIn: '1h' },
        ),
      ).rejects.toThrow('expiresIn');
    });
  });
});
