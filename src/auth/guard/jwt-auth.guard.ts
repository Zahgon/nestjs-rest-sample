import { Request, Response } from 'express';
import { AuthGuard } from '../../core/auth-guard';
import { UnauthorizedException } from '../../core/http-exception';

export class JwtAuthGuard extends AuthGuard {
  constructor() {
    super('jwt');
  }

  canActivate(req: Request, res: Response): Promise<boolean> {
    // Add your custom authentication logic here
    // for example, call super.logIn(request) to establish a session.
    return super.canActivate(req, res);
  }

  handleRequest(err: any, user: any, info: any) {
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
