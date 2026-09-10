import { Response, Router } from 'express';
import { lastValueFrom } from 'rxjs';
import { ConflictException } from '../core/http-exception';
import { handle, RouteDeps } from '../core/route';
import { RegisterDto } from './register.dto';
import { UserService } from './user.service';

export class RegisterController {
  constructor(private readonly userService: UserService) {}

  async register(registerDto: RegisterDto, res: Response): Promise<Response> {
    const { username, email } = registerDto;

    const existsByUsername = await lastValueFrom(
      this.userService.existsByUsername(username),
    );
    if (existsByUsername) {
      throw new ConflictException(`username:${username} is existed`);
    }

    const existsByEmail = await lastValueFrom(
      this.userService.existsByEmail(email),
    );
    if (existsByEmail) {
      throw new ConflictException(`email:${email} is existed`);
    }

    const user = await lastValueFrom(this.userService.register(registerDto));
    return res
      .location('/users/' + user._id)
      .status(201)
      .send();
  }
}

export const createRegisterRouter = (
  controller: RegisterController,
  { throttler, validationPipe }: RouteDeps,
): Router => {
  const router = Router();

  router.post(
    '/',
    throttler.forHandler('RegisterController', 'register'),
    handle(async (req, res) => {
      await controller.register(
        await validationPipe.transform(req.body, RegisterDto),
        res,
      );
    }),
  );

  return router;
};
