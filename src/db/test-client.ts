import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('TEST_DATABASE_URL is not set');
}

const client = postgres(connectionString);

export const testDb = drizzle(client, { schema });
export const testDbClient = client;
