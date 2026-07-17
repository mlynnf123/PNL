import { config } from 'dotenv';

config({ path: '.env.local' });

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export default async function setup() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL is not set');
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: './drizzle' });
  await client.end();
}
