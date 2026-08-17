import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Reuse a single postgres-js pool across dev HMR reloads. Without this, every
// hot reload re-evaluates this module and opens a fresh pool, leaking
// connections until Supabase's Supavisor pooler refuses new ones (XX000 FATAL).
// prepare:false is Supabase's recommended setting for its connection poolers;
// max/idle_timeout keep the footprint small (this is a low-concurrency app).
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
  __db?: DbClient;
};

function createDb() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const client =
    globalForDb.__pgClient ??
    postgres(connectionString, { prepare: false, max: 5, idle_timeout: 20 });

  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__pgClient = client;
  }

  return drizzle(client, { schema });
}

// Open the pool (and require DATABASE_URL) lazily on first use, not at import
// time. `next build` evaluates route modules to collect page data without a
// database configured; a top-level connect/throw there fails the build even
// though nothing queries during the build. Deferring keeps builds env-free
// while still failing fast the first time a request actually touches the DB.
function getDb(): DbClient {
  const existing = globalForDb.__db;
  if (existing) return existing;

  const created = createDb();
  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__db = created;
  }
  return created;
}

export type DbClient = ReturnType<typeof createDb>;

export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

// Accepts either the top-level client or a callback's transaction handle,
// so command/helper functions can run standalone or inside db.transaction().
export type DbOrTx = DbClient | Parameters<Parameters<DbClient['transaction']>[0]>[0];
