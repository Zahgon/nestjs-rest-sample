import { Connection } from 'mongoose';
import { CommentModel, createCommentModel } from './comment.model';
import { COMMENT_MODEL, POST_MODEL, USER_MODEL } from './database.constants';
import { PostModel, createPostModel } from './post.model';
import { UserModel, createUserModel } from './user.model';

export interface DatabaseModels {
  [POST_MODEL]: PostModel;
  [COMMENT_MODEL]: CommentModel;
  [USER_MODEL]: UserModel;
}

export const createDatabaseModels = (
  connection: Connection,
): DatabaseModels => ({
  [POST_MODEL]: createPostModel(connection),
  [COMMENT_MODEL]: createCommentModel(connection),
  [USER_MODEL]: createUserModel(connection),
});
