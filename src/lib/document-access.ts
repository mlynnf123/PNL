import { PERMISSIONS, type PermissionKey } from './permissions';

export type DocumentEntityType = 'job' | 'lead' | 'estimate' | 'contract';

// A document inherits the access rules of the entity it belongs to. Jobs use the
// financial permissions; CRM entities (leads/estimates/contracts) use the CRM
// permissions. Org scope is always enforced separately.
export function uploadPermissionFor(entityType: DocumentEntityType): PermissionKey {
  return entityType === 'job' ? PERMISSIONS.FINANCIAL_ENTRY : PERMISSIONS.CRM_MANAGEMENT;
}

export function viewPermissionFor(entityType: DocumentEntityType): PermissionKey {
  return entityType === 'job' ? PERMISSIONS.JOB_VIEWING : PERMISSIONS.CRM_VIEWING;
}
