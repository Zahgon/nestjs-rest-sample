import { Request, Router } from 'express';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { handle, RouteDeps } from '../core/route';

export class ProfileController {
  getProfile(req: Request): any {
    return req.user;
  }
}

export const createProfileRouter = (
  controller: ProfileController,
  { throttler }: RouteDeps,
): Router => {
  const router = Router();
  const jwtAuthGuard = new JwtAuthGuard();

  router.get(
    '/profile',
    throttler.forHandler('ProfileController', 'getProfile'),
    jwtAuthGuard.use(),
    handle((req) => controller.getProfile(req)),
  );

  return router;
};
