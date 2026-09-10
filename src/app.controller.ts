import { Router } from 'express';
import { handle, RouteDeps } from './core/route';
import { AppService } from './app.service';

export class AppController {
  constructor(private readonly appService: AppService) {}

  getHello(): string {
    return this.appService.getHello();
  }
}

export const createAppRouter = (
  controller: AppController,
  { throttler }: RouteDeps,
): Router => {
  const router = Router();

  router.get(
    '/',
    throttler.forHandler('AppController', 'getHello'),
    handle(() => controller.getHello()),
  );

  return router;
};
