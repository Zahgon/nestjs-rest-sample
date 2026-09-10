import jwtConfig, { JwtConfig } from './jwt.config';

describe('jwtConfig', () => {
  let config: JwtConfig;
  beforeEach(async () => {
    config = jwtConfig();
  });

  it('should be defined', () => {
    expect(jwtConfig).toBeDefined();
  });

  it('should contain JWT config values', async () => {
    expect(config.secretKey).toBe('rzxlszyykpbgqcflzxsqcysyhljt');
    expect(config.expiresIn).toBe('3600s');
    expect(config.refreshSecretKey).toBe(
      'refresh-rzxlszyykpbgqcflzxsqcysyhljt',
    );
    expect(config.refreshExpiresIn).toBe('7d');
  });
});
