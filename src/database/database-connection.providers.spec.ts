jest.mock('mongoose', () => ({
  createConnection: jest.fn().mockImplementation((uri: string) => ({})),
  Connection: jest.fn(),
}));

import { Connection, createConnection } from 'mongoose';
import mongodbConfig from '../config/mongodb.config';
import { createDatabaseConnection } from './database-connection.providers';

describe('DatabaseConnectionProviders', () => {
  let conn: Connection;

  beforeEach(async () => {
    conn = createDatabaseConnection(mongodbConfig());
  });

  it('DATABASE_CONNECTION should be defined', () => {
    expect(conn).toBeDefined();
  });

  it('connect is called', () => {
    expect(createConnection).toHaveBeenCalledWith('mongodb://localhost/blog');
  });
});
