// Shared estimate-layout seeding, used by both the full seed (src/db/seed.ts)
// and the standalone typed-layouts script (src/db/seed-estimate-types.ts).
// One source of truth so the two never drift.

import { and, eq } from 'drizzle-orm';
import type { DbClient } from './client';
import { estimateLayoutPages, estimateLayoutVersions, estimateLayouts } from './schema';
import { type StackEntry, defaultContentFor } from '@/lib/estimate-pages';
import { ESTIMATE_TYPES, type EstimateTypeDef } from '@/lib/estimate-types';

const INTRO_BODY =
  'Hi {{customer.name}},\n\nThank you for the opportunity to quote on your project at {{property.address}}. Please find your estimate below along with the full scope of work.\n\nIf you have any questions, please give me a call. We always want to provide the best value to our clients.\n\nKind regards,\n{{rep.name}}';

const AUTH_CONTENT = {
  validityNote:
    'Estimates valid for 30 days from date of estimate / A 50% deposit is required before any project begins',
  optionalUpgrades: [],
  selectedOptionId: null,
  signature: null,
  certification:
    'By signing this form I agree to and confirm the following: I certify that I am the registered owner of the above project property, or have the legal permission to authorize the work as stated. I agree to pay the total project price and understand that this work will be completed in accordance with industry best practices.',
};

const WARRANTY_CONTENT = {
  body: 'The work performed at {{property.address}} is backed by a workmanship warranty from JJ Roofing Pros. This warranty guarantees that the labor is free from defects in workmanship for the full warranty term from the date the work is completed.',
  thankYou: 'Thank you again for choosing JJ Roofing Pros to complete work on your property.',
};

// The standard estimate-packet page stack for a job type. The terms page carries
// no explicit content, so it inherits the standard T&C from defaultContentFor.
function standardPacketPages(t: EstimateTypeDef): (StackEntry & { content?: unknown })[] {
  return [
    { pageType: 'cover', title: 'Cover' },
    { pageType: 'introduction', title: 'Introduction', content: { body: INTRO_BODY } },
    { pageType: 'quote', title: `${t.label} Details` },
    { pageType: 'authorization', title: 'Authorization', content: AUTH_CONTENT },
    { pageType: 'terms', title: 'Terms and Conditions' },
    { pageType: 'warranty', title: 'Warranty', content: WARRANTY_CONTENT },
  ];
}

// Idempotent: publish a starter layout (skips if a layout with this name exists).
export async function seedLayout(
  db: DbClient,
  args: {
    orgId: string;
    createdBy: string;
    name: string;
    category: string;
    pages: (StackEntry & { content?: unknown })[];
  },
) {
  const [existing] = await db
    .select()
    .from(estimateLayouts)
    .where(and(eq(estimateLayouts.organizationId, args.orgId), eq(estimateLayouts.name, args.name)))
    .limit(1);
  if (existing) return;

  const [layout] = await db
    .insert(estimateLayouts)
    .values({
      organizationId: args.orgId,
      name: args.name,
      docKind: 'estimate_packet',
      category: args.category,
      status: 'active',
      createdBy: args.createdBy,
    })
    .returning();
  const [version] = await db
    .insert(estimateLayoutVersions)
    .values({
      organizationId: args.orgId,
      layoutId: layout.id,
      versionNumber: 1,
      status: 'published',
      publishedBy: args.createdBy,
      publishedAt: new Date(),
      createdBy: args.createdBy,
    })
    .returning();
  for (let i = 0; i < args.pages.length; i++) {
    const p = args.pages[i];
    await db.insert(estimateLayoutPages).values({
      layoutVersionId: version.id,
      pageType: p.pageType,
      sortOrder: i,
      title: p.title,
      defaultContentJson: (p.content ?? defaultContentFor(p.pageType)) as object,
    });
  }
  await db
    .update(estimateLayouts)
    .set({ currentVersionId: version.id })
    .where(eq(estimateLayouts.id, layout.id));
  console.log(`Seeded layout "${args.name}"`);
}

// Ensure one active/published layout exists per ESTIMATE_TYPES entry. Idempotent.
export async function ensureTypedEstimateLayouts(
  db: DbClient,
  args: { orgId: string; createdBy: string },
) {
  for (const t of ESTIMATE_TYPES) {
    await seedLayout(db, {
      orgId: args.orgId,
      createdBy: args.createdBy,
      name: t.layoutName,
      category: t.category,
      pages: standardPacketPages(t),
    });
  }
}

// Retire a layout by name so it drops out of the selectable list (non-destructive
// — existing documents keep their snapshotted pages).
export async function retireLayoutByName(db: DbClient, orgId: string, name: string) {
  await db
    .update(estimateLayouts)
    .set({ status: 'retired' })
    .where(and(eq(estimateLayouts.organizationId, orgId), eq(estimateLayouts.name, name)));
}
