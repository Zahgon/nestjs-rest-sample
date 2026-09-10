import { Router } from 'express';
import { User } from 'database/user.model';
import { Observable } from 'rxjs';
import { handle, RouteDeps } from '../core/route';
import { defaultValue } from '../core/transform';
import { ParseObjectIdPipe } from '../shared/pipe/parse-object-id.pipe';
import { UserService } from './user.service';

export class UserController {
  constructor(private readonly userService: UserService) {}

  getUser(id: string, withPosts?: boolean): Observable<Partial<User>> {
    return this.userService.findById(id, withPosts);
  }
}

export const createUserRouter = (
  controller: UserController,
  { throttler, validationPipe }: RouteDeps,
): Router => {
  const router = Router();
  const parseObjectIdPipe = new ParseObjectIdPipe();

  router.get(
    '/:id',
    throttler.forHandler('UserController', 'getUser'),
    handle((req) =>
      controller.getUser(
        parseObjectIdPipe.transform(
          validationPipe.transformPrimitive(req.params.id, String),
        ),
        defaultValue(
          validationPipe.transformPrimitive(req.query.withPosts, Boolean),
          false,
        ),
      ),
    ),
  );

  return router;
};
