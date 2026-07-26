import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { contracts, revenueComponents } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import {
  type ContractLineItem,
  type ContractSignatures,
  type PaymentSchedule,
  contractTotal,
  sanitizeLineItems,
  sanitizePaymentSchedule,
} from '@/lib/contract-math';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class ContractNotFoundError extends Error {
  constructor(id: string) {
    super(`Contract not found: ${id}`);
    this.name = 'ContractNotFoundError';
  }
}

const UNIQUE_VIOLATION = '23505';
const MAX_NUMBER_ATTEMPTS = 5;

export interface ContractFields {
  title: string;
  customerName?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  companyRepName?: string | null;
  companyRepTitle?: string | null;
  projectDescription?: string | null;
  workLocation?: string | null;
  startDate?: string | null;
  completionDate?: string | null;
  terms?: string | null;
  warrantyInfo?: string | null;
  notes?: string | null;
  lineItems: ContractLineItem[];
  paymentSchedule: Partial<PaymentSchedule> | null;
  leadId?: string | null;
}

type TxHandle = Parameters<Parameters<DbClient['transaction']>[0]>[0];

function valuesFor(input: ContractFields) {
  const lineItems = sanitizeLineItems(input.lineItems);
  return {
    title: input.title.trim(),
    customerName: input.customerName,
    customerAddress: input.customerAddress,
    customerCity: input.customerCity,
    customerState: input.customerState,
    customerZip: input.customerZip,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    companyRepName: input.companyRepName,
    companyRepTitle: input.companyRepTitle,
    projectDescription: input.projectDescription,
    workLocation: input.workLocation,
    startDate: input.startDate || null,
    completionDate: input.completionDate || null,
    terms: input.terms,
    warrantyInfo: input.warrantyInfo,
    notes: input.notes,
    lineItemsJson: lineItems,
    paymentScheduleJson: sanitizePaymentSchedule(input.paymentSchedule),
    total: contractTotal(lineItems).toFixed(2),
    leadId: input.leadId || null,
  };
}

export interface CreateContractInput extends ContractFields {
  actorUserId: string;
  organizationId: string;
  correlationId?: string;
}

export async function createContract(input: CreateContractInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    if (!input.title.trim()) {
      throw new Error('A contract title is required.');
    }

    const [{ maxNumber }] = await tx
      .select({ maxNumber: sql<number>`COALESCE(MAX(${contracts.contractNumber}), 0)::int` })
      .from(contracts)
      .where(eq(contracts.organizationId, input.organizationId));

    const base = valuesFor(input);
    let contract: typeof contracts.$inferSelect | undefined;
    for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt++) {
      try {
        [contract] = await (tx as TxHandle).transaction(async (tx2) =>
          tx2
            .insert(contracts)
            .values({
              organizationId: input.organizationId,
              contractNumber: maxNumber + attempt + 1,
              status: 'draft',
              createdBy: input.actorUserId,
              ...base,
            })
            .returning(),
        );
        break;
      } catch (err) {
        const code = (err as { cause?: { code?: string } }).cause?.code;
        if (code === UNIQUE_VIOLATION && attempt < MAX_NUMBER_ATTEMPTS - 1) continue;
        throw err;
      }
    }
    if (!contract) throw new Error('Could not generate a unique contract number.');

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'contract.created',
      entityType: 'contract',
      entityId: contract.id,
      newState: { contractNumber: contract.contractNumber, total: contract.total },
      source: 'web',
      correlationId: input.correlationId,
    });

    return contract;
  });
}

export interface UpdateContractInput extends ContractFields {
  actorUserId: string;
  organizationId: string;
  contractId: string;
  expectedRowVersion?: number;
  correlationId?: string;
}

export async function updateContract(input: UpdateContractInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(contracts)
      .where(
        and(eq(contracts.id, input.contractId), eq(contracts.organizationId, input.organizationId)),
      )
      .limit(1);
    if (!existing) throw new ContractNotFoundError(input.contractId);

    const clauses = [eq(contracts.id, input.contractId)];
    if (input.expectedRowVersion !== undefined) {
      clauses.push(eq(contracts.rowVersion, input.expectedRowVersion));
    }

    const [updated] = await tx
      .update(contracts)
      .set({
        ...valuesFor(input),
        updatedAt: new Date(),
        rowVersion: sql`${contracts.rowVersion} + 1`,
      })
      .where(and(...clauses))
      .returning();
    if (!updated) throw new ConcurrencyConflictError('contract');

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'contract.updated',
      entityType: 'contract',
      entityId: updated.id,
      newState: { total: updated.total },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface ContractStatusInput {
  actorUserId: string;
  organizationId: string;
  contractId: string;
  status: 'draft' | 'sent' | 'signed' | 'completed';
  correlationId?: string;
}

export async function updateContractStatus(input: ContractStatusInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(contracts)
      .where(
        and(eq(contracts.id, input.contractId), eq(contracts.organizationId, input.organizationId)),
      )
      .limit(1);
    if (!existing) throw new ContractNotFoundError(input.contractId);

    const [updated] = await tx
      .update(contracts)
      .set({
        status: input.status,
        updatedAt: new Date(),
        rowVersion: sql`${contracts.rowVersion} + 1`,
      })
      .where(eq(contracts.id, input.contractId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'contract.status_changed',
      entityType: 'contract',
      entityId: updated.id,
      previousState: { status: existing.status },
      newState: { status: updated.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface SignContractInput {
  actorUserId: string;
  organizationId: string;
  contractId: string;
  role: 'company' | 'customer';
  signerName: string;
  // A documents.id (uploaded signature PNG, served via /api/documents).
  documentId: string;
  signedAt: string;
  correlationId?: string;
}

// Records a captured signature into signaturesJson. Deliberately does NOT bump
// rowVersion (an open builder's concurrency token stays valid). Adding a
// customer signature auto-advances a draft/sent contract to 'signed'.
export async function signContract(input: SignContractInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    if (!input.signerName.trim()) {
      throw new Error('A signer name is required.');
    }

    const [existing] = await tx
      .select()
      .from(contracts)
      .where(
        and(eq(contracts.id, input.contractId), eq(contracts.organizationId, input.organizationId)),
      )
      .limit(1);
    if (!existing) throw new ContractNotFoundError(input.contractId);

    const signatures: ContractSignatures = {
      ...(existing.signaturesJson as ContractSignatures),
      [input.role]: {
        documentId: input.documentId,
        signerName: input.signerName.trim(),
        signedAt: input.signedAt,
      },
    };

    const advance =
      input.role === 'customer' && (existing.status === 'draft' || existing.status === 'sent');

    const [updated] = await tx
      .update(contracts)
      .set({
        signaturesJson: signatures,
        status: advance ? 'signed' : existing.status,
        updatedAt: new Date(),
      })
      .where(eq(contracts.id, input.contractId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'contract.signed',
      entityType: 'contract',
      entityId: updated.id,
      newState: { role: input.role, signerName: input.signerName.trim(), status: updated.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface SeedRevenueFromContractInput {
  actorUserId: string;
  organizationId: string;
  contractId: string;
  jobId: string;
  effectiveDate: string;
  correlationId?: string;
}

// Offered, not automatic: create a job's original-contract revenue component
// from a contract total. Requires financial_entry (crosses into money), links
// the contract to the job, and audits both facts in one transaction.
export async function seedRevenueFromContract(
  input: SeedRevenueFromContractInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [contract] = await tx
      .select()
      .from(contracts)
      .where(
        and(eq(contracts.id, input.contractId), eq(contracts.organizationId, input.organizationId)),
      )
      .limit(1);
    if (!contract) throw new ContractNotFoundError(input.contractId);

    const [component] = await tx
      .insert(revenueComponents)
      .values({
        jobId: input.jobId,
        componentType: 'original_contract',
        description: `Contract CON-${String(contract.contractNumber).padStart(4, '0')}`,
        amount: contract.total,
        effectiveDate: input.effectiveDate,
        createdBy: input.actorUserId,
      })
      .returning();

    const [updated] = await tx
      .update(contracts)
      .set({ jobId: input.jobId, updatedAt: new Date() })
      .where(eq(contracts.id, input.contractId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'revenue_component.created',
      entityType: 'revenue_component',
      entityId: component.id,
      jobId: input.jobId,
      newState: {
        componentType: component.componentType,
        amount: component.amount,
        status: component.status,
        fromContractId: contract.id,
      },
      source: 'web',
      correlationId: input.correlationId,
    });

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'contract.linked_to_job',
      entityType: 'contract',
      entityId: contract.id,
      jobId: input.jobId,
      newState: { jobId: input.jobId, revenueComponentId: component.id },
      source: 'web',
      correlationId: input.correlationId,
    });

    return { component, contract: updated };
  });
}

export interface DeleteContractInput {
  actorUserId: string;
  organizationId: string;
  contractId: string;
  correlationId?: string;
}

export async function deleteContract(input: DeleteContractInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(contracts)
      .where(
        and(eq(contracts.id, input.contractId), eq(contracts.organizationId, input.organizationId)),
      )
      .limit(1);
    if (!existing) throw new ContractNotFoundError(input.contractId);

    await tx.delete(contracts).where(eq(contracts.id, input.contractId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'contract.deleted',
      entityType: 'contract',
      entityId: existing.id,
      previousState: { contractNumber: existing.contractNumber, title: existing.title },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}
