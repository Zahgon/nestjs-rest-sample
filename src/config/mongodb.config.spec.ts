import mongodbConfig, { MongodbConfig } from './mongodb.config';

describe('mongodbConfig', () => {
  let config: MongodbConfig;
  beforeEach(async () => {
    config = mongodbConfig();
  });

  it('should be defined', () => {
    expect(mongodbConfig).toBeDefined();
  });

  it('should contains uri key', async () => {
    expect(config.uri).toBe('mongodb://localhost/blog');
  });
});
