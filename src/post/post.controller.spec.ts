import { lastValueFrom, Observable, of } from 'rxjs';
import { anyNumber, anyString, instance, mock, verify, when } from 'ts-mockito';
import { Post } from '../database/post.model';
import { CreatePostDto } from './create-post.dto';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { PostServiceStub } from './post.service.stub';
import { UpdatePostDto } from './update-post.dto';
import { createMock } from '@golevelup/ts-jest';
import { Response } from 'express';

describe('Post Controller', () => {
  describe('Replace PostService in provider(useClass: PostServiceStub)', () => {
    let controller: PostController;

    beforeEach(async () => {
      // The Nest testing module resolved `{ provide: PostService, useClass:
      // PostServiceStub }`. Without a container the stub class is instantiated
      // and handed to the constructor directly. PostServiceStub satisfies
      // `Pick<PostService, keyof PostService>` rather than PostService itself --
      // PostService declares private members -- so the substitution is spelled
      // out at the seam instead of being erased by the container.
      controller = new PostController(
        new PostServiceStub() as unknown as PostService,
      );
    });

    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('GET on /posts should return all posts', async () => {
      const posts = await lastValueFrom(controller.getAllPosts());
      expect(posts.length).toBe(3);
    });

    it('GET on /posts/:id should return one post ', (done) => {
      controller.getPostById('1').subscribe((data) => {
        expect(data._id).toEqual('1');
        done();
      });
    });

    it('POST on /posts should save post', async () => {
      const post: CreatePostDto = {
        title: 'test title',
        content: 'test content',
      };
      const saved = await lastValueFrom(
        controller.createPost(
          post,
          createMock<Response>({
            location: jest.fn().mockReturnValue({
              status: jest.fn().mockReturnValue({
                send: jest.fn().mockReturnValue({
                  headers: { location: '/posts/post_id' },
                  status: 201,
                }),
              }),
            }),
          }),
        ),
      );
      // console.log(saved);
      expect(saved.status).toBe(201);
    });

    it('PUT on /posts/:id should update the existing post', (done) => {
      const post: UpdatePostDto = {
        title: 'test title',
        content: 'test content',
      };
      controller
        .updatePost(
          '1',
          post,
          createMock<Response>({
            status: jest.fn().mockReturnValue({
              send: jest.fn().mockReturnValue({
                status: 204,
              }),
            }),
          }),
        )
        .subscribe((data) => {
          expect(data.status).toBe(204);
          done();
        });
    });

    it('DELETE on /posts/:id should delete post', (done) => {
      controller
        .deletePostById(
          '1',
          createMock<Response>({
            status: jest.fn().mockReturnValue({
              send: jest.fn().mockReturnValue({
                status: 204,
              }),
            }),
          }),
        )
        .subscribe((data) => {
          expect(data).toBeTruthy();
          done();
        });
    });

    it('POST on /posts/:id/comments', async () => {
      const result = await lastValueFrom(
        controller.createCommentForPost(
          'testpost',
          { content: 'testcomment' },
          createMock<Response>({
            location: jest.fn().mockReturnValue({
              status: jest.fn().mockReturnValue({
                send: jest.fn().mockReturnValue({
                  headers: { location: '/posts/post_id/comments/comment_id' },
                  status: 201,
                }),
              }),
            }),
          }),
        ),
      );

      expect(result.status).toBe(201);
    });

    it('GET on /posts/:id/comments', async () => {
      const result = await lastValueFrom(
        controller.getAllCommentsOfPost('testpost'),
      );

      expect(result.length).toBe(1);
    });
  });

  describe('Replace PostService in provider(useValue: fake object)', () => {
    let controller: PostController;
    const id = '5ee49c3115a4e75254bb732e';

    beforeEach(async () => {
      // `useValue` with a hand-written fake object: the literal stands in for the
      // whole service and only the method under test is spelled out.
      const fakePostService = {
        findAll: (_keyword?: string, _skip?: number, _limit?: number) =>
          of<any[]>([
            {
              _id: id,
              title: 'test title',
              content: 'test content',
            },
          ]),
      };

      controller = new PostController(
        fakePostService as unknown as PostService,
      );
    });

    it('should get all posts(useValue: fake object)', async () => {
      const result = await lastValueFrom(controller.getAllPosts());
      expect(result[0]._id).toEqual(id);
    });
  });

  describe('Replace PostService in provider(useValue: jest mocked object)', () => {
    let controller: PostController;
    let postService: PostService;
    const id = '5ee49c3115a4e75254bb732e';

    beforeEach(async () => {
      // `useValue` with a jest-mocked object: the same substitution as above, but
      // the stand-in records its calls so the delegation can be asserted.
      const mockedPostService = {
        constructor: jest.fn(),
        findAll: jest
          .fn()
          .mockImplementation(
            (_keyword?: string, _skip?: number, _limit?: number) =>
              of<any[]>([
                {
                  _id: id,
                  title: 'test title',
                  content: 'test content',
                },
              ]),
          ),
      };

      postService = mockedPostService as unknown as PostService;
      controller = new PostController(postService);
    });

    it('should get all posts(useValue: jest mocking)', async () => {
      const keyword = 'test';
      const result = await lastValueFrom(
        controller.getAllPosts(keyword, 10, 0),
      );
      expect(result[0]._id).toEqual(id);
      expect(postService.findAll).toHaveBeenCalled();
      expect(postService.findAll).toHaveBeenLastCalledWith(keyword, 0, 10);
    });
  });

  describe('Mocking PostService using ts-mockito', () => {
    let controller: PostController;
    const mockedPostService: PostService = mock(PostService);

    beforeEach(async () => {
      controller = new PostController(instance(mockedPostService));
    });

    it('should get all posts(ts-mockito)', async () => {
      when(
        mockedPostService.findAll(anyString(), anyNumber(), anyNumber()),
      ).thenReturn(
        of([
          {
            _id: '5ee49c3115a4e75254bb732e',
            title: 'test title',
            content: 'content',
          },
        ]) as unknown as Observable<Post[]>,
      );
      const result = await lastValueFrom(controller.getAllPosts('', 10, 0));
      expect(result.length).toEqual(1);
      expect(result[0].title).toBe('test title');
      verify(
        mockedPostService.findAll(anyString(), anyNumber(), anyNumber()),
      ).once();
    });
  });
});
