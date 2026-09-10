import * as jwt from 'jsonwebtoken';

/**
 * `jsonwebtoken` types the lifetime as a template-literal union of time
 * strings, which a value read from the environment cannot satisfy
 * statically. Accept the widened type at the edge and narrow it once, in
 * `signAsync`, right before handing it to the library.
 */
export type SignOptionsWithLooseExpiry = Omit<jwt.SignOptions, 'expiresIn'> & {
  expiresIn?: string | number;
};

export interface JwtModuleOptions {
  secret?: jwt.Secret;
  signOptions?: SignOptionsWithLooseExpiry;
}

export interface JwtSignOptions extends SignOptionsWithLooseExpiry {
  secret?: jwt.Secret;
}

export interface JwtVerifyOptions extends jwt.VerifyOptions {
  secret?: jwt.Secret;
}

/**
 * Signs and verifies the access and refresh tokens. The per-call secret takes
 * precedence over the one the service was built with, which is what lets the
 * refresh token be signed and checked with its own key.
 */
export class JwtService {
  constructor(private readonly options: JwtModuleOptions = {}) {}

  signAsync(payload: object, options?: JwtSignOptions): Promise<string> {
    const { secret, ...signOptions } = options ?? {};
    const secretOrKey = (secret ?? this.options.secret) as jwt.Secret;
    const { expiresIn, ...rest } = {
      ...this.options.signOptions,
      ...signOptions,
    };
    const mergedOptions: jwt.SignOptions = { ...rest };
    if (expiresIn !== undefined) {
      mergedOptions.expiresIn = expiresIn as jwt.SignOptions['expiresIn'];
    }
    return new Promise<string>((resolve, reject) => {
      jwt.sign(payload, secretOrKey, mergedOptions, (err, token) =>
        err ? reject(err) : resolve(token as string),
      );
    });
  }

  verifyAsync<T extends object = any>(
    token: string,
    options?: JwtVerifyOptions,
  ): Promise<T> {
    const { secret, ...verifyOptions } = options ?? {};
    const secretOrKey = (secret ?? this.options.secret) as jwt.Secret;
    return new Promise<T>((resolve, reject) => {
      jwt.verify(token, secretOrKey, verifyOptions, (err, decoded) =>
        err ? reject(err) : resolve(decoded as T),
      );
    });
  }
}
