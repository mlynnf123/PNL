// Pure contract math — no DB access. The server recomputes the authoritative
// `total` from line items; the client mirrors these for a live preview but is
// never trusted. Money is handled as numbers here only for display/estimation;
// the stored `total` is serialized with two-decimal precision by the command.

export type LineCategory = 'roofing' | 'gutter' | 'window' | 'other';

export interface ContractLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category: LineCategory;
}

export interface ProgressPayment {
  description: string;
  amount: number;
}

export interface PaymentSchedule {
  depositAmount: number;
  progressPayments: ProgressPayment[];
  finalPayment: number;
}

export interface ContractSignature {
  documentId: string;
  signerName: string;
  signedAt: string;
}

export interface ContractSignatures {
  company?: ContractSignature;
  customer?: ContractSignature;
}

function num(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

export function lineTotal(item: Pick<ContractLineItem, 'quantity' | 'unitPrice'>): number {
  return Math.round(num(item.quantity) * num(item.unitPrice) * 100) / 100;
}

export function contractTotal(items: ContractLineItem[]): number {
  return items.reduce((sum, it) => sum + lineTotal(it), 0);
}

export function scheduledTotal(schedule: PaymentSchedule): number {
  const progress = schedule.progressPayments.reduce((s, p) => s + num(p.amount), 0);
  return num(schedule.depositAmount) + progress + num(schedule.finalPayment);
}

const CATEGORIES: LineCategory[] = ['roofing', 'gutter', 'window', 'other'];

// Recompute each line total, coerce loose input, and drop empty rows.
export function sanitizeLineItems(items: ContractLineItem[]): ContractLineItem[] {
  return items
    .map((it) => {
      const quantity = num(it.quantity);
      const unitPrice = num(it.unitPrice);
      return {
        id: String(it.id),
        description: (it.description ?? '').trim(),
        quantity,
        unitPrice,
        total: lineTotal({ quantity, unitPrice }),
        category: CATEGORIES.includes(it.category) ? it.category : 'roofing',
      };
    })
    .filter((it) => it.description !== '' || it.total !== 0);
}

export function sanitizePaymentSchedule(
  schedule: Partial<PaymentSchedule> | null,
): PaymentSchedule {
  const s = schedule ?? {};
  return {
    depositAmount: num(s.depositAmount),
    progressPayments: (s.progressPayments ?? [])
      .map((p) => ({ description: (p.description ?? '').trim(), amount: num(p.amount) }))
      .filter((p) => p.description !== '' || p.amount !== 0),
    finalPayment: num(s.finalPayment),
  };
}
