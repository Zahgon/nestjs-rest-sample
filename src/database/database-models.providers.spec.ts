import { createMock } from '@golevelup/ts-jest';
import { Connection, Model } from 'mongoose';
import { Comment, CommentModel } from './comment.model';
import { COMMENT_MODEL, POST_MODEL, USER_MODEL } from './database.constants';
import {
  DatabaseModels,
  createDatabaseModels,
} from './database-models.providers';
import { Post, PostModel } from './post.model';
import { User, UserModel } from './user.model';

describe('DatabaseModelsProviders', () => {
  let conn: Connection;
  let userModel: UserModel;
  let postModel: PostModel;
  let commentModel: CommentModel;

  beforeEach(async () => {
    conn = createMock<Connection>({
      model: jest.fn().mockReturnValue({} as Model<User | Post | Comment>),
    });

    const models: DatabaseModels = createDatabaseModels(conn);

    userModel = models[USER_MODEL];
    postModel = models[POST_MODEL];
    commentModel = models[COMMENT_MODEL];
  });

  it('DATABASE_CONNECTION should be defined', () => {
    expect(conn).toBeDefined();
  });

  it('USER_MODEL should be defined', () => {
    expect(userModel).toBeDefined();
  });

  it('POST_MODEL should be defined', () => {
    expect(postModel).toBeDefined();
  });

  it('COMMENT_MODEL should be defined', () => {
    expect(commentModel).toBeDefined();
  });
});
