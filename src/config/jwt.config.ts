export interface JwtConfig {
  secretKey: string;
  expiresIn: string;
  refreshSecretKey: string;
  refreshExpiresIn: string;
}

export default (): JwtConfig => ({
  secretKey: process.env.JWT_SECRET_KEY ?? 'rzxlszyykpbgqcflzxsqcysyhljt',
  expiresIn: process.env.JWT_EXPIRES_IN || '3600s',
  refreshSecretKey:
    process.env.JWT_REFRESH_SECRET_KEY ??
    'refresh-rzxlszyykpbgqcflzxsqcysyhljt',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
});
