export interface MongodbConfig {
  uri: string;
}

export default (): MongodbConfig => ({
  uri: process.env.MONGODB_URI || 'mongodb://localhost/blog',
});
