import { Model } from 'mongoose';
import { Comment } from '../database/comment.model';
import { Post } from '../database/post.model';
import { CreatePostDto } from './create-post.dto';

export class PostDataInitializerService {
  private data: CreatePostDto[] = [
    {
      title: 'Generate a NestJS project',
      content: 'content',
    },
    {
      title: 'Create CRUD RESTful APIs',
      content: 'content',
    },
    {
      title: 'Connect to MongoDB',
      content: 'content',
    },
  ];

  constructor(
    private postModel: Model<Post>,
    private commentModel: Model<Comment>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.SEED_DATABASE !== 'true') return;

    console.log('(PostModule) is initialized...');
    await this.postModel.deleteMany({});
    await this.commentModel.deleteMany({});
    await this.postModel.insertMany(this.data).then((r) => console.log(r));
  }
}
