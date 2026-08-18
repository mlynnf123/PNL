'use server';

import { db } from '@/db/client';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import { type ActivityItem, getRecentActivity } from '@/server/queries/recent-activity';

// Poll target for the live activity feed. Re-checks the session and permission
// on every call, and stays org-scoped, so the interval can never leak another
// org's activity or outlive the viewer's access.
export async function fetchRecentActivity(): Promise<ActivityItem[]> {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.AUDIT_VIEWING);
  if (!canView) return [];
  return getRecentActivity(session.user.organizationId, 12);
}
