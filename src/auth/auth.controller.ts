import { Router } from 'express';
import { Observable } from 'rxjs';
import { handle, RouteDeps } from '../core/route';
import { AuthService } from './auth.service';
import { LoginResponseDto } from './dto/login-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LocalAuthGuard } from './guard/local-auth.guard';
import { AuthenticatedRequest } from './interface/authenticated-request.interface';

export class AuthController {
  constructor(private authService: AuthService) {}

  login(req: AuthenticatedRequest): Observable<LoginResponseDto> {
    return this.authService.login(req.user);
  }

  refresh(dto: RefreshTokenDto): Observable<LoginResponseDto> {
    return this.authService.refreshToken(dto.refresh_token);
  }
}

export const createAuthRouter = (
  controller: AuthController,
  { throttler, validationPipe }: RouteDeps,
): Router => {
  const router = Router();
  const localAuthGuard = new LocalAuthGuard();

  router.post(
    '/login',
    throttler.forHandler('AuthController', 'login'),
    localAuthGuard.use(),
    handle((req) => controller.login(req as AuthenticatedRequest)),
  );

  router.post(
    '/refresh',
    throttler.forHandler('AuthController', 'refresh'),
    handle(async (req) =>
      controller.refresh(
        await validationPipe.transform(req.body, RefreshTokenDto),
      ),
    ),
  );

  return router;
};
