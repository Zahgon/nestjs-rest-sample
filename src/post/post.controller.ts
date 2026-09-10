import { Request, Response, Router } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RoleType } from '../shared/enum/role-type.enum';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { hasRoles } from '../auth/guard/roles.guard';
import { ParseObjectIdPipe } from '../shared/pipe/parse-object-id.pipe';
import { handle, RouteDeps } from '../core/route';
import { defaultValue, parseIntValue } from '../core/transform';
import { Comment } from '../database/comment.model';
import { Post as BlogPost } from '../database/post.model';
import { CreateCommentDto } from './create-comment.dto';
import { CreatePostDto } from './create-post.dto';
import { PostService } from './post.service';
import { UpdatePostDto } from './update-post.dto';

export class PostController {
  constructor(private readonly postService: PostService) {}

  getAllPosts(
    keyword?: string,
    limit?: number,
    skip?: number,
  ): Observable<BlogPost[]> {
    return this.postService.findAll(keyword, skip, limit);
  }

  getPostById(id: string): Observable<BlogPost> {
    return this.postService.findById(id);
  }

  createPost(post: CreatePostDto, res: Response): Observable<Response> {
    return this.postService.save(post).pipe(
      map((post) => {
        return res
          .location('/posts/' + post._id)
          .status(201)
          .send();
      }),
    );
  }

  updatePost(
    id: string,
    post: UpdatePostDto,
    res: Response,
  ): Observable<Response> {
    return this.postService.update(id, post).pipe(
      map(() => {
        return res.status(204).send();
      }),
    );
  }

  deletePostById(id: string, res: Response): Observable<Response> {
    return this.postService.deleteById(id).pipe(
      map(() => {
        return res.status(204).send();
      }),
    );
  }

  createCommentForPost(
    id: string,
    data: CreateCommentDto,
    res: Response,
  ): Observable<Response> {
    return this.postService.createCommentFor(id, data).pipe(
      map((comment) => {
        return res
          .location('/posts/' + id + '/comments/' + comment._id)
          .status(201)
          .send();
      }),
    );
  }

  getAllCommentsOfPost(id: string): Observable<Comment[]> {
    return this.postService.commentsOf(id);
  }
}

/**
 * The controller is rebuilt per request because the service behind it stamps
 * the documents it writes with the calling principal.
 */
export const createPostRouter = (
  createController: (req: Request) => PostController,
  { throttler, validationPipe }: RouteDeps,
): Router => {
  const router = Router();
  const parseObjectIdPipe = new ParseObjectIdPipe();
  const jwtAuthGuard = new JwtAuthGuard();

  const pathId = (req: Request): string =>
    parseObjectIdPipe.transform(
      validationPipe.transformPrimitive(req.params.id, String),
    );

  router.get(
    '/',
    throttler.forHandler('PostController', 'getAllPosts'),
    handle((req) =>
      createController(req).getAllPosts(
        validationPipe.transformPrimitive(req.query.q, String),
        parseIntValue(
          defaultValue(
            validationPipe.transformPrimitive(req.query.limit, Number),
            10,
          ),
        ),
        parseIntValue(
          defaultValue(
            validationPipe.transformPrimitive(req.query.skip, Number),
            0,
          ),
        ),
      ),
    ),
  );

  router.get(
    '/:id',
    throttler.forHandler('PostController', 'getPostById'),
    handle((req) => createController(req).getPostById(pathId(req))),
  );

  router.post(
    '/',
    throttler.forHandler('PostController', 'createPost'),
    jwtAuthGuard.use(),
    hasRoles(RoleType.USER, RoleType.ADMIN),
    handle(async (req, res) =>
      createController(req).createPost(
        await validationPipe.transform(req.body, CreatePostDto),
        res,
      ),
    ),
  );

  router.put(
    '/:id',
    throttler.forHandler('PostController', 'updatePost'),
    jwtAuthGuard.use(),
    hasRoles(RoleType.USER, RoleType.ADMIN),
    handle(async (req, res) =>
      createController(req).updatePost(
        pathId(req),
        await validationPipe.transform(req.body, UpdatePostDto),
        res,
      ),
    ),
  );

  router.delete(
    '/:id',
    throttler.forHandler('PostController', 'deletePostById'),
    jwtAuthGuard.use(),
    hasRoles(RoleType.ADMIN),
    handle((req, res) =>
      createController(req).deletePostById(pathId(req), res),
    ),
  );

  router.post(
    '/:id/comments',
    throttler.forHandler('PostController', 'createCommentForPost'),
    jwtAuthGuard.use(),
    hasRoles(RoleType.USER),
    handle(async (req, res) =>
      createController(req).createCommentForPost(
        pathId(req),
        await validationPipe.transform(req.body, CreateCommentDto),
        res,
      ),
    ),
  );

  router.get(
    '/:id/comments',
    throttler.forHandler('PostController', 'getAllCommentsOfPost'),
    handle((req) => createController(req).getAllCommentsOfPost(pathId(req))),
  );

  return router;
};
