import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { permissions, rolePermissions, userRoles } from '@/db/schema';

// docs/03_DATA_MODEL.md SS2: "Important permissions include financial entry,
// cost finalization, close approval, commission approval, high-risk approval,
// payment posting, reopening, settings management, report export, audit
// viewing, and company-profit viewing."
export const PERMISSIONS = {
  FINANCIAL_ENTRY: 'financial_entry',
  COST_FINALIZATION: 'cost_finalization',
  CLOSE_APPROVAL: 'close_approval',
  COMMISSION_APPROVAL: 'commission_approval',
  HIGH_RISK_APPROVAL: 'high_risk_approval',
  PAYMENT_POSTING: 'payment_posting',
  REOPENING: 'reopening',
  SETTINGS_MANAGEMENT: 'settings_management',
  REPORT_EXPORT: 'report_export',
  AUDIT_VIEWING: 'audit_viewing',
  COMPANY_PROFIT_VIEWING: 'company_profit_viewing',
  JOB_VIEWING: 'job_viewing',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: ReadonlyArray<{ key: PermissionKey; description: string }> = [
  { key: PERMISSIONS.FINANCIAL_ENTRY, description: 'Enter revenue, cost, and payment data' },
  {
    key: PERMISSIONS.COST_FINALIZATION,
    description: 'Approve and finalize labor/material cost categories',
  },
  { key: PERMISSIONS.CLOSE_APPROVAL, description: 'Approve routine financial close' },
  { key: PERMISSIONS.COMMISSION_APPROVAL, description: 'Approve commission allocation batches' },
  {
    key: PERMISSIONS.HIGH_RISK_APPROVAL,
    description: 'Provide the required second approval for high-risk actions',
  },
  { key: PERMISSIONS.PAYMENT_POSTING, description: 'Post commission payments and draws' },
  { key: PERMISSIONS.REOPENING, description: 'Reopen closed job financials' },
  {
    key: PERMISSIONS.SETTINGS_MANAGEMENT,
    description: 'Manage users, roles, commission rules, and settings',
  },
  { key: PERMISSIONS.REPORT_EXPORT, description: 'Export reports' },
  { key: PERMISSIONS.AUDIT_VIEWING, description: 'View the audit log' },
  {
    key: PERMISSIONS.COMPANY_PROFIT_VIEWING,
    description: "View Company Profit and other reps' commission",
  },
  {
    key: PERMISSIONS.JOB_VIEWING,
    description: 'View jobs, financial summaries, and reports',
  },
];

export class AuthorizationError extends Error {
  constructor(permission: PermissionKey) {
    super(`Missing required permission: ${permission}`);
    this.name = 'AuthorizationError';
  }
}

export async function userHasPermission(
  db: DbOrTx,
  userId: string,
  permission: PermissionKey,
): Promise<boolean> {
  const rows = await db
    .select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(userRoles.userId, userId), eq(permissions.key, permission)))
    .limit(1);

  return rows.length > 0;
}

export async function requirePermission(
  db: DbOrTx,
  userId: string,
  permission: PermissionKey,
): Promise<void> {
  const allowed = await userHasPermission(db, userId, permission);
  if (!allowed) {
    throw new AuthorizationError(permission);
  }
}
