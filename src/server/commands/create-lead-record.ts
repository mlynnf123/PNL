import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { jobs } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { displayNameFrom } from '@/lib/person-name';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

// The front-of-funnel entry point. A lead is just a job at the `lead_new` stage
// with only contact info — no customer, address, contract amount or number yet
// (those arrive when it reaches `signed`, via setJobStage). crm_management-gated
// like the other pipeline moves, NOT financial_entry: no money is recorded here.
export interface CreateLeadRecordInput {
  actorUserId: string;
  organizationId: string;
  // Structured name — a person (first/last) and/or a company. prospectName is
  // derived from these (company, else "First Last").
  prospectFirstName?: string;
  prospectLastName?: string;
  prospectCompany?: string;
  // Optional pre-composed display name (import path); ignored when the structured
  // fields yield a name.
  prospectName?: string;
  prospectPhone?: string;
  prospectEmail?: string;
  prospectAddress?: string;
  source?: 'referral' | 'online' | 'advertisement' | 'cold_call' | 'other';
  priority?: 'low' | 'medium' | 'high';
  preferredContact?: 'phone' | 'email' | 'text';
  estimatedValue?: string;
  description?: string;
  notes?: string;
  assignedTo?: string;
  nextFollowUp?: string;
  correlationId?: string;
}

export async function createLeadRecord(input: CreateLeadRecordInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const displayName =
      displayNameFrom({
        firstName: input.prospectFirstName,
        lastName: input.prospectLastName,
        company: input.prospectCompany,
      }) ||
      input.prospectName?.trim() ||
      '(no name)';

    const [job] = await tx
      .insert(jobs)
      .values({
        organizationId: input.organizationId,
        productionPhase: 'lead_new',
        // Money lifecycle sits at Draft until the deal is signed.
        operationalStatus: 'Draft',
        prospectName: displayName,
        prospectFirstName: input.prospectFirstName || null,
        prospectLastName: input.prospectLastName || null,
        prospectCompany: input.prospectCompany || null,
        prospectPhone: input.prospectPhone,
        prospectEmail: input.prospectEmail,
        prospectAddress: input.prospectAddress,
        source: input.source,
        priority: input.priority,
        preferredContact: input.preferredContact,
        estimatedValue: input.estimatedValue,
        description: input.description,
        notes: input.notes,
        assignedTo: input.assignedTo,
        nextFollowUp: input.nextFollowUp,
        // The creator owns the eventual commission split (same as the lead model).
        dealOwnerUserId: input.actorUserId,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job.created',
      entityType: 'job',
      entityId: job.id,
      jobId: job.id,
      newState: { productionPhase: 'lead_new', prospectName: input.prospectName },
      source: 'web',
      correlationId: input.correlationId,
    });

    return job;
  });
}
