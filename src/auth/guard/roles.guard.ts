import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenException } from '../../core/http-exception';
import { RoleType } from '../../shared/enum/role-type.enum';
import { AuthenticatedRequest } from '../interface/authenticated-request.interface';

export class RolesGuard {
  constructor(private readonly roles: RoleType[]) {}

  canActivate(request: Request): boolean {
    const roles = this.roles;
    if (!roles || roles.length == 0) {
      return true;
    }

    const { user } = request as AuthenticatedRequest;
    return user.roles && user.roles.some((r) => roles.includes(r));
  }

  use(): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction) => {
      if (this.canActivate(req)) {
        next();
        return;
      }
      next(new ForbiddenException('Forbidden resource'));
    };
  }
}

/**
 * Restricts a route to the listed roles. An empty list leaves the route open.
 */
export const hasRoles = (...roles: RoleType[]): RequestHandler =>
  new RolesGuard(roles).use();
