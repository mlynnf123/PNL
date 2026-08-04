import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Reuse a single postgres-js pool across dev HMR reloads. Without this, every
// hot reload re-evaluates this module and opens a fresh pool, leaking
// connections until Supabase's Supavisor pooler refuses new ones (XX000 FATAL).
// prepare:false is Supabase's recommended setting for its connection poolers;
// max/idle_timeout keep the footprint small (this is a low-concurrency app).
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pgClient ??
  postgres(connectionString, { prepare: false, max: 5, idle_timeout: 20 });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__pgClient = client;
}

export const db = drizzle(client, { schema });

export type DbClient = typeof db;
// Accepts either the top-level client or a callback's transaction handle,
// so command/helper functions can run standalone or inside db.transaction().
export type DbOrTx = DbClient | Parameters<Parameters<DbClient['transaction']>[0]>[0];
