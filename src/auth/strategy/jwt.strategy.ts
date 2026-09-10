import { ExtractJwt, Strategy, VerifiedCallback } from 'passport-jwt';
import { JwtConfig } from '../../config/jwt.config';
import { JwtPayload } from '../interface/jwt-payload.interface';
import { UserPrincipal } from '../interface/user-principal.interface';

export class JwtStrategy extends Strategy {
  constructor(config: JwtConfig) {
    super(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: false,
        secretOrKey: config.secretKey,
      },
      function (
        this: JwtStrategy,
        payload: JwtPayload,
        done: VerifiedCallback,
      ) {
        done(null, this.validate(payload));
      },
    );
  }

  //payload is the decoded jwt clmais.
  validate(payload: JwtPayload): UserPrincipal {
    //console.log('jwt payload:' + JSON.stringify(payload));
    return {
      username: payload.upn,
      email: payload.email,
      id: payload.sub,
      roles: payload.roles,
    };
  }
}
