import { Connection, createConnection } from 'mongoose';
import { MongodbConfig } from '../config/mongodb.config';

export const createDatabaseConnection = (
  dbConfig: MongodbConfig,
): Connection => {
  return createConnection(dbConfig.uri);
};
