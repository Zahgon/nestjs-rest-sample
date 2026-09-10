import { Model, Types } from 'mongoose';
import { lastValueFrom } from 'rxjs';

import { AuthenticatedRequest } from '../auth/interface/authenticated-request.interface';
import { Comment } from '../database/comment.model';
import { Post } from '../database/post.model';
import { PostService } from './post.service';
import { CreatePostDto } from './create-post.dto';

// The Nest testing module handed the models in through the POST_MODEL and
// COMMENT_MODEL tokens and the request through REQUEST. The service now takes
// all three as constructor arguments, so the `useValue` objects are kept as
// plain jest mocks and passed positionally.
type MockedModel = Record<string, jest.Mock>;

describe('PostService', () => {
  let service: PostService;
  let model: MockedModel;
  let commentModel: MockedModel;

  const TEST_USER_ID = new Types.ObjectId('605c39f4bcf86cd799439011');

  beforeEach(async () => {
    model = {
      new: jest.fn(),
      constructor: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      exec: jest.fn(),
      deleteMany: jest.fn(),
      deleteOne: jest.fn(),
      updateOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findOneAndDelete: jest.fn(),
    };

    commentModel = {
      new: jest.fn(),
      constructor: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      deleteOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      exec: jest.fn(),
    };

    // The service is no longer request-scoped through the container; the router
    // builds a fresh instance per request, so the request is the third argument.
    const req = {
      user: {
        id: '605c39f4bcf86cd799439011',
      },
    } as unknown as AuthenticatedRequest;

    service = new PostService(
      model as unknown as Model<Post>,
      commentModel as unknown as Model<Comment>,
      req,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return all posts', async () => {
    const posts = [
      {
        _id: '5ee49c3115a4e75254bb732e',
        title: 'Generate a NestJS project',
        content: 'content',
      },
      {
        _id: '5ee49c3115a4e75254bb732f',
        title: 'Create CRUD RESTful APIs',
        content: 'content',
      },
      {
        _id: '5ee49c3115a4e75254bb7330',
        title: 'Connect to MongoDB',
        content: 'content',
      },
    ];
    jest.spyOn(model, 'find').mockReturnValue({
      skip: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValueOnce(posts),
        }),
      }),
    });

    const data = await lastValueFrom(service.findAll());
    expect(data.length).toBe(3);
    expect(model.find).toHaveBeenCalled();

    jest.spyOn(model, 'find').mockImplementation(() => {
      return {
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValueOnce([posts[0]]),
          }),
        }),
      };
    });

    const result = await lastValueFrom(service.findAll('Generate', 0, 10));
    expect(result.length).toBe(1);
    expect(model.find).toHaveBeenLastCalledWith({
      title: { $regex: '.*' + 'Generate' + '.*' },
    });
  });

  describe('findByid', () => {
    it('if exists return one post', (done) => {
      const found = {
        _id: '5ee49c3115a4e75254bb732e',
        title: 'Generate a NestJS project',
        content: 'content',
      };

      jest.spyOn(model, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(found),
      });

      service.findById('1').subscribe({
        next: (data) => {
          expect(data._id).toBe('5ee49c3115a4e75254bb732e');
          expect(data.title).toEqual('Generate a NestJS project');
        },
        error: (error) => console.log(error),
        complete: done(),
      });
    });

    it('if not found throw an NotFoundException', (done) => {
      jest.spyOn(model, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(null),
      });

      service.findById('1').subscribe({
        next: (data) => {
          console.log(data);
        },
        error: (error) => {
          expect(error).toBeDefined();
        },
        complete: done(),
      });
    });
  });

  it('should save post', async () => {
    const toCreated = {
      title: 'test title',
      content: 'test content',
    } as unknown as CreatePostDto;

    const toReturned = {
      _id: '5ee49c3115a4e75254bb732e',
      ...toCreated,
    };

    jest
      .spyOn(model, 'create')
      .mockImplementation(() => Promise.resolve(toReturned));

    const data = await lastValueFrom(service.save(toCreated));
    expect(data._id).toBe('5ee49c3115a4e75254bb732e');
    expect(model.create).toHaveBeenCalledWith({
      ...toCreated,
      createdBy: TEST_USER_ID,
    });
    expect(model.create).toHaveBeenCalledTimes(1);
  });

  describe('update', () => {
    it('perform update if post exists', (done) => {
      const toUpdated = {
        _id: '5ee49c3115a4e75254bb732e',
        title: 'test title',
        content: 'test content',
      };

      jest.spyOn(model, 'findOneAndUpdate').mockReturnValue({
        exec: jest.fn().mockResolvedValue(toUpdated),
      });

      service.update('5ee49c3115a4e75254bb732e', toUpdated).subscribe({
        next: (data) => {
          expect(data).toBeTruthy();
          expect(model.findOneAndUpdate).toHaveBeenCalled();
        },
        error: (error) => console.log(error),
        complete: done(),
      });
    });

    it('throw an NotFoundException if post not exists', (done) => {
      const toUpdated = {
        _id: '5ee49c3115a4e75254bb732e',
        title: 'test title',
        content: 'test content',
      };
      jest.spyOn(model, 'findOneAndUpdate').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      service.update('5ee49c3115a4e75254bb732e', toUpdated).subscribe({
        error: (error) => {
          expect(error).toBeDefined();
          expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
        },
        complete: done(),
      });
    });
  });

  describe('delete', () => {
    it('perform delete if post exists', (done) => {
      const toDeleted = {
        _id: '5ee49c3115a4e75254bb732e',
        title: 'test title',
        content: 'test content',
      };
      jest.spyOn(model, 'findOneAndDelete').mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(toDeleted),
      });

      service.deleteById('anystring').subscribe({
        next: (data) => {
          expect(data).toBeTruthy();
          expect(model.findOneAndDelete).toHaveBeenCalled();
        },
        error: (error) => console.log(error),
        complete: done(),
      });
    });

    it('throw an NotFoundException if post not exists', (done) => {
      jest.spyOn(model, 'findOneAndDelete').mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      service.deleteById('anystring').subscribe({
        error: (error) => {
          expect(error).toBeDefined();
          expect(model.findOneAndDelete).toHaveBeenCalledTimes(1);
        },
        complete: done(),
      });
    });
  });

  it('should delete all post', (done) => {
    jest.spyOn(model, 'deleteMany').mockReturnValue({
      exec: jest.fn().mockResolvedValueOnce({
        deletedCount: 1,
      }),
    });

    service.deleteAll().subscribe({
      next: (data) => expect(data).toBeTruthy,
      error: (error) => console.log(error),
      complete: done(),
    });
  });

  it('should create comment ', async () => {
    const comment = { content: 'test' };
    const TEST_ID = '605c39f4bcf86cd799439011';
    const TEST_OBJ_ID = new Types.ObjectId(TEST_ID);
    const mockedCreateResult = {
      ...comment,
      post: TEST_OBJ_ID,
    };
    jest
      .spyOn(commentModel, 'create')
      .mockImplementation((any) => Promise.resolve(mockedCreateResult));

    const result = await lastValueFrom(
      service.createCommentFor(TEST_ID, comment),
    );
    expect(result.content).toEqual('test');
    expect(commentModel.create).toHaveBeenCalledWith({
      ...comment,
      post: TEST_OBJ_ID,
      createdBy: TEST_USER_ID,
    });
  });

  it('should get comments of post ', async () => {
    const TEST_ID = '605c39f4bcf86cd799439011';
    const TEST_OBJ_ID = new Types.ObjectId(TEST_ID);
    jest.spyOn(commentModel, 'find').mockImplementation(() => {
      return {
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            {
              _id: '605c3a2ebcf86cd799439012',
              content: 'content',
              post: TEST_OBJ_ID,
            },
          ]),
        }),
      };
    });

    const result = await lastValueFrom(service.commentsOf(TEST_ID));
    expect(result.length).toBe(1);
    expect(result[0].content).toEqual('content');
    expect(commentModel.find).toHaveBeenCalledWith({ post: TEST_OBJ_ID });
  });
});
