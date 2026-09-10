import { Request } from 'express';
import { UserPrincipal } from '../../auth/interface/user-principal.interface';

export const CurrentUser = (request: Request): UserPrincipal => {
  return (request as Request & { user: UserPrincipal }).user;
};
