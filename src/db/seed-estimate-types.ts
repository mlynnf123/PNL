// Ensure the standard job-type estimate/contract layouts exist in the live DB,
// and retire the old generic starters. Idempotent — safe to re-run.
//
// Run: npm run db:seed-types

import { config } from 'dotenv';

config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import { organizations, users } from './schema';
import { ensureTypedEstimateLayouts, retireLayoutByName } from './seed-layouts';

// Layouts superseded by the typed set; retired so they drop out of the picker.
const RETIRE_NAMES = ['Full Roof Replacement', 'Repair Estimate'];

async function main() {
  const { db } = await import('./client');

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.legalName, 'JJ Roofing'))
    .limit(1);
  if (!org) {
    throw new Error('Organization "JJ Roofing" not found — run `npm run db:seed` first.');
  }

  const [owner] = await db.select().from(users).where(eq(users.organizationId, org.id)).limit(1);
  if (!owner) {
    throw new Error(`No user found in organization ${org.id} to own the layouts.`);
  }

  await ensureTypedEstimateLayouts(db, { orgId: org.id, createdBy: owner.id });
  for (const name of RETIRE_NAMES) {
    await retireLayoutByName(db, org.id, name);
  }

  console.log(`Typed estimate layouts ensured; retired: ${RETIRE_NAMES.join(', ')}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
