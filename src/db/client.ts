import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const client = postgres(connectionString);

export const db = drizzle(client, { schema });

export type DbClient = typeof db;
// Accepts either the top-level client or a callback's transaction handle,
// so command/helper functions can run standalone or inside db.transaction().
export type DbOrTx = DbClient | Parameters<Parameters<DbClient['transaction']>[0]>[0];
