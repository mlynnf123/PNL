'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import type { DocKind, PageType } from '@/lib/estimate-pages';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import {
  addLayoutPage,
  createLayout,
  discardLayoutDraft,
  duplicateLayout,
  publishLayout,
  removeLayoutPage,
  reorderLayoutPages,
  restoreLayoutVersion,
  retireLayout,
  updateLayoutMeta,
  updateLayoutPage,
} from '@/server/commands/estimate-layouts';

const BASE = '/dashboard/estimate-layouts';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function handle(err: unknown): ActionResult {
  if (err instanceof AuthorizationError)
    return { ok: false, error: 'You do not have permission to do that.' };
  if (err instanceof ConcurrencyConflictError) return { ok: false, error: err.message };
  throw err;
}

function actor(session: { user: { id: string; organizationId: string } }) {
  return { actorUserId: session.user.id, organizationId: session.user.organizationId };
}

export async function createLayoutAction(
  name: string,
  docKind: DocKind,
  category?: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const { layout } = await createLayout({ ...actor(session), name, docKind, category });
    revalidatePath(BASE);
    return { ok: true, id: layout.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateLayoutMetaAction(
  layoutId: string,
  expectedRowVersion: number,
  fields: { name?: string; category?: string | null; isDefault?: boolean },
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateLayoutMeta({ ...actor(session), layoutId, expectedRowVersion, ...fields });
    revalidatePath(`${BASE}/${layoutId}`);
    revalidatePath(BASE);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function addLayoutPageAction(
  layoutId: string,
  pageType: PageType,
  afterPageId?: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const page = await addLayoutPage({ ...actor(session), layoutId, pageType, afterPageId });
    revalidatePath(`${BASE}/${layoutId}`);
    return { ok: true, id: page.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateLayoutPageAction(
  layoutId: string,
  pageId: string,
  fields: { title?: string | null; configJson?: unknown; defaultContentJson?: unknown },
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateLayoutPage({ ...actor(session), layoutId, pageId, ...fields });
    revalidatePath(`${BASE}/${layoutId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function removeLayoutPageAction(
  layoutId: string,
  pageId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await removeLayoutPage({ ...actor(session), layoutId, pageId });
    revalidatePath(`${BASE}/${layoutId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function reorderLayoutPagesAction(
  layoutId: string,
  orderedPageIds: string[],
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await reorderLayoutPages({ ...actor(session), layoutId, orderedPageIds });
    revalidatePath(`${BASE}/${layoutId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function publishLayoutAction(
  layoutId: string,
  name?: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await publishLayout({ ...actor(session), layoutId, name });
    revalidatePath(`${BASE}/${layoutId}`);
    revalidatePath(BASE);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function restoreLayoutVersionAction(
  layoutId: string,
  sourceVersionId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await restoreLayoutVersion({ ...actor(session), layoutId, sourceVersionId });
    revalidatePath(`${BASE}/${layoutId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function discardLayoutDraftAction(layoutId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await discardLayoutDraft({ ...actor(session), layoutId });
    revalidatePath(`${BASE}/${layoutId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function duplicateLayoutAction(layoutId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const layout = await duplicateLayout({ ...actor(session), layoutId });
    revalidatePath(BASE);
    return { ok: true, id: layout.id };
  } catch (err) {
    return handle(err);
  }
}

export async function retireLayoutAction(layoutId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await retireLayout({ ...actor(session), layoutId });
    revalidatePath(BASE);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
