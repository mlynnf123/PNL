'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Badge, Button, Drawer, FormField, Input, Modal, Select, Textarea } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  CONTRACT_STATUS_TONE,
  ESTIMATE_DOC_STATUS_TONE,
  LEAD_STATUS_TONE as STATUS_TONE,
  PRIORITY_TONE,
} from '@/lib/status';
import type { ContractListRow } from '@/server/queries/contracts';
import type { EstimateDocListRow } from '@/server/queries/estimate-documents';
import type { LeadRow } from '@/server/queries/leads';
import {
  type ActionResult,
  convertLeadAction,
  createLeadAction,
  deleteLeadAction,
  updateLeadAction,
  updateLeadStatusAction,
} from './actions';

type User = { id: string; displayName: string };

const STATUSES = ['new', 'contacted', 'quoted', 'converted', 'lost'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;
const SOURCES = ['referral', 'online', 'advertisement', 'cold_call', 'other'] as const;
const CONTACTS = ['phone', 'email', 'text'] as const;

function label(value: string): string {
  return value.replace(/_/g, ' ');
}

export function LeadsClient({
  leads,
  users,
  canManage,
  estimatesByLead = {},
  contractsByLead = {},
  openLeadId,
}: {
  leads: LeadRow[];
  users: User[];
  canManage: boolean;
  estimatesByLead?: Record<string, EstimateDocListRow[]>;
  contractsByLead?: Record<string, ContractListRow[]>;
  openLeadId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  // undefined = closed, null = create, LeadRow = edit
  const [formLead, setFormLead] = useState<LeadRow | null | undefined>(undefined);
  const [detail, setDetail] = useState<LeadRow | null>(() =>
    openLeadId ? (leads.find((l) => l.id === openLeadId) ?? null) : null,
  );
  const [error, setError] = useState('');

  // Search + priority filtered (but NOT status) — the basis for the bucket counts.
  const preStatus = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter((l) => {
      const matchesSearch =
        !q ||
        l.customerName.toLowerCase().includes(q) ||
        (l.customerPhone ?? '').includes(search) ||
        (l.customerEmail ?? '').toLowerCase().includes(q) ||
        (l.notes ?? '').toLowerCase().includes(q);
      const matchesPriority = priorityFilter === 'all' || l.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [leads, search, priorityFilter]);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of preStatus) m.set(l.status, (m.get(l.status) ?? 0) + 1);
    return m;
  }, [preStatus]);

  const filtered = useMemo(
    () => (statusFilter === 'all' ? preStatus : preStatus.filter((l) => l.status === statusFilter)),
    [preStatus, statusFilter],
  );

  function run(action: Promise<ActionResult>, onOk?: (r: ActionResult) => void) {
    setError('');
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOk?.(res);
      router.refresh();
    });
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <h2 className="text-2xl font-[550] tracking-[0.015em] text-slate-900">Lead Management</h2>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg bg-slate-100 p-1">
              {(['grid', 'list'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                    view === v
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            {canManage && <Button onClick={() => setFormLead(null)}>New Lead</Button>}
          </div>
        </div>

        {error && (
          <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row">
            <input
              type="text"
              placeholder="Search leads..."
              className="w-full flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="rounded-lg border border-slate-300 p-2 text-sm outline-none"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">All Priority</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status buckets with counts */}
        <div className="flex flex-wrap gap-2">
          {['all', ...STATUSES].map((b) => {
            const count = b === 'all' ? preStatus.length : (statusCounts.get(b) ?? 0);
            const active = statusFilter === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setStatusFilter(b)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  active
                    ? 'bg-slate-800 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {b}
                <span
                  className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <h3 className="mb-2 text-lg font-[550] tracking-[0.015em] text-slate-900">
              No leads found
            </h3>
            <p className="text-sm text-slate-500">
              {search || statusFilter !== 'all' || priorityFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'Get started by creating your first lead.'}
            </p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {filtered.map((lead) => (
              <div
                key={lead.id}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <button
                      type="button"
                      onClick={() => setDetail(lead)}
                      className="text-left font-medium text-slate-900 transition-colors hover:text-teal-600"
                    >
                      {lead.customerName}
                    </button>
                    <div className="text-sm text-slate-500 capitalize">{label(lead.source)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={PRIORITY_TONE[lead.priority]}>{lead.priority}</Badge>
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => setFormLead(lead)}
                          title="Edit lead"
                          className="p-1 text-slate-400 transition-colors hover:text-blue-600"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Delete this lead? This cannot be undone.')) {
                              run(deleteLeadAction(lead.id));
                            }
                          }}
                          title="Delete lead"
                          className="p-1 text-slate-400 transition-colors hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mb-3 space-y-1 text-sm text-slate-600">
                  {lead.customerPhone && <div>{lead.customerPhone}</div>}
                  {lead.customerEmail && <div>{lead.customerEmail}</div>}
                </div>

                {lead.notes && (
                  <p className="mb-4 line-clamp-2 text-sm text-slate-700">{lead.notes}</p>
                )}

                <div className="mb-4 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-900">
                    {formatCurrency(lead.estimatedValue)}
                  </span>
                  <span className="text-xs text-slate-500">{formatDate(lead.updatedAt)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={lead.status}
                    disabled={!canManage || lead.status === 'converted'}
                    onChange={(e) =>
                      run(
                        updateLeadStatusAction(
                          lead.id,
                          e.target.value as (typeof STATUSES)[number],
                        ),
                      )
                    }
                    className="flex-1 rounded-lg border border-slate-300 p-2 text-xs capitalize outline-none disabled:bg-slate-50"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <Badge tone={STATUS_TONE[lead.status]}>{lead.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {['Customer', 'Contact', 'Value', 'Priority', 'Status', 'Updated', ''].map(
                      (h, i) => (
                        <th
                          key={i}
                          className="px-6 py-3 text-xs font-medium tracking-wider text-slate-500 uppercase"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-6 py-3">
                        <button
                          type="button"
                          onClick={() => setDetail(lead)}
                          className="text-left font-medium text-slate-900 hover:text-teal-600"
                        >
                          {lead.customerName}
                        </button>
                        <div className="text-xs text-slate-500 capitalize">
                          {label(lead.source)}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        <div>{lead.customerPhone}</div>
                        <div className="text-xs text-slate-500">{lead.customerEmail}</div>
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {formatCurrency(lead.estimatedValue)}
                      </td>
                      <td className="px-6 py-3">
                        <Badge tone={PRIORITY_TONE[lead.priority]}>{lead.priority}</Badge>
                      </td>
                      <td className="px-6 py-3">
                        <Badge tone={STATUS_TONE[lead.status]}>{lead.status}</Badge>
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-500">
                        {formatDate(lead.updatedAt)}
                      </td>
                      <td className="px-6 py-3">
                        {canManage && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setFormLead(lead)}
                              title="Edit lead"
                              className="p-1 text-slate-400 hover:text-blue-600"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm('Delete this lead? This cannot be undone.')) {
                                  run(deleteLeadAction(lead.id));
                                }
                              }}
                              title="Delete lead"
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {formLead !== undefined && (
        <LeadFormModal
          lead={formLead}
          users={users}
          pending={isPending}
          onClose={() => setFormLead(undefined)}
          onSubmit={(fields) => {
            const action = formLead
              ? updateLeadAction(formLead.id, formLead.rowVersion, fields)
              : createLeadAction(fields);
            run(action, () => setFormLead(undefined));
          }}
        />
      )}

      <LeadDetailDrawer
        lead={detail}
        canManage={canManage}
        pending={isPending}
        estimates={detail ? (estimatesByLead[detail.id] ?? []) : []}
        contracts={detail ? (contractsByLead[detail.id] ?? []) : []}
        onClose={() => setDetail(null)}
        onEdit={(lead) => {
          setDetail(null);
          setFormLead(lead);
        }}
        onConvert={(fundingType) => {
          if (!detail) return;
          run(convertLeadAction(detail.id, fundingType), (r) => {
            if (r.ok && r.jobNumber) {
              setDetail(null);
              alert(`Converted to job ${r.jobNumber}.`);
            }
          });
        }}
      />
    </>
  );
}

function LeadFormModal({
  lead,
  users,
  pending,
  onClose,
  onSubmit,
}: {
  lead: LeadRow | null;
  users: User[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (fields: {
    customerName: string;
    customerAddress: string;
    customerPhone: string;
    customerEmail: string;
    preferredContact: 'phone' | 'email' | 'text';
    source: (typeof SOURCES)[number];
    priority: (typeof PRIORITIES)[number];
    estimatedValue: string;
    description: string;
    notes: string;
    assignedTo: string;
    nextFollowUp: string;
  }) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={lead ? 'Edit lead' : 'New lead'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="lead-form" disabled={pending}>
            {lead ? 'Save changes' : 'Create lead'}
          </Button>
        </>
      }
    >
      <form
        id="lead-form"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          onSubmit({
            customerName: String(data.get('customerName') ?? ''),
            customerAddress: String(data.get('customerAddress') ?? ''),
            customerPhone: String(data.get('customerPhone') ?? ''),
            customerEmail: String(data.get('customerEmail') ?? ''),
            preferredContact: data.get('preferredContact') as 'phone' | 'email' | 'text',
            source: data.get('source') as (typeof SOURCES)[number],
            priority: data.get('priority') as (typeof PRIORITIES)[number],
            estimatedValue: String(data.get('estimatedValue') ?? '0'),
            description: String(data.get('description') ?? ''),
            notes: String(data.get('notes') ?? ''),
            assignedTo: String(data.get('assignedTo') ?? ''),
            nextFollowUp: String(data.get('nextFollowUp') ?? ''),
          });
        }}
      >
        <div className="sm:col-span-2">
          <FormField label="Customer name">
            <Input name="customerName" required defaultValue={lead?.customerName ?? ''} />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Address">
            <Input name="customerAddress" defaultValue={lead?.customerAddress ?? ''} />
          </FormField>
        </div>
        <FormField label="Phone">
          <Input name="customerPhone" defaultValue={lead?.customerPhone ?? ''} />
        </FormField>
        <FormField label="Email">
          <Input name="customerEmail" type="email" defaultValue={lead?.customerEmail ?? ''} />
        </FormField>
        <FormField label="Preferred contact">
          <Select name="preferredContact" defaultValue={lead?.preferredContact ?? 'phone'}>
            {CONTACTS.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Source">
          <Select name="source" defaultValue={lead?.source ?? 'other'}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Priority">
          <Select name="priority" defaultValue={lead?.priority ?? 'medium'}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Estimated value">
          <Input
            name="estimatedValue"
            type="number"
            step="0.01"
            min="0"
            defaultValue={lead?.estimatedValue ?? '0'}
          />
        </FormField>
        <FormField label="Assigned to">
          <Select name="assignedTo" defaultValue={lead?.assignedTo ?? ''}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Next follow-up">
          <Input name="nextFollowUp" type="date" defaultValue={lead?.nextFollowUp ?? ''} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Description">
            <Input name="description" defaultValue={lead?.description ?? ''} />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Notes">
            <Textarea name="notes" rows={3} defaultValue={lead?.notes ?? ''} />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}

function LeadDetailDrawer({
  lead,
  canManage,
  pending,
  estimates,
  contracts,
  onClose,
  onEdit,
  onConvert,
}: {
  lead: LeadRow | null;
  canManage: boolean;
  pending: boolean;
  estimates: EstimateDocListRow[];
  contracts: ContractListRow[];
  onClose: () => void;
  onEdit: (lead: LeadRow) => void;
  onConvert: (fundingType: 'insurance' | 'retail' | 'other') => void;
}) {
  const [funding, setFunding] = useState<'insurance' | 'retail' | 'other'>('insurance');
  if (!lead) return null;
  const converted = lead.status === 'converted' || !!lead.convertedJobId;

  return (
    <Drawer
      open={!!lead}
      onClose={onClose}
      title={lead.customerName}
      footer={
        canManage ? (
          <Button variant="secondary" onClick={() => onEdit(lead)}>
            Edit
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={STATUS_TONE[lead.status]}>{lead.status}</Badge>
          <Badge tone={PRIORITY_TONE[lead.priority]}>{lead.priority} priority</Badge>
          <Badge tone="slate">{label(lead.source)}</Badge>
        </div>

        <Detail label="Estimated value" value={formatCurrency(lead.estimatedValue)} />
        <Detail label="Phone" value={lead.customerPhone ?? '—'} />
        <Detail label="Email" value={lead.customerEmail ?? '—'} />
        <Detail label="Address" value={lead.customerAddress ?? '—'} />
        <Detail label="Preferred contact" value={lead.preferredContact} />
        <Detail label="Assigned to" value={lead.assignedToName ?? 'Unassigned'} />
        <Detail label="Next follow-up" value={formatDate(lead.nextFollowUp)} />
        <Detail label="Last contact" value={formatDate(lead.lastContactDate)} />
        {lead.description && <Detail label="Description" value={lead.description} />}
        {lead.notes && <Detail label="Notes" value={lead.notes} />}

        {canManage && !converted && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-medium text-slate-900">Convert to job</p>
            <div className="flex items-center gap-2">
              <Select
                value={funding}
                onChange={(e) => setFunding(e.target.value as 'insurance' | 'retail' | 'other')}
                className="flex-1"
              >
                <option value="insurance">Insurance</option>
                <option value="retail">Retail</option>
                <option value="other">Other</option>
              </Select>
              <Button variant="accent" disabled={pending} onClick={() => onConvert(funding)}>
                Convert
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Creates a financial job from this lead ({formatCurrency(lead.estimatedValue)}{' '}
              contract).
            </p>
          </div>
        )}

        {converted && lead.convertedJobId && (
          <p className="text-sm text-teal-700">Converted to a job.</p>
        )}

        <div className="border-t border-slate-200 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">Estimates</p>
            {canManage && (
              <Link
                href={`/dashboard/estimates/new?leadId=${lead.id}`}
                className="text-sm font-medium text-teal-600 hover:underline"
              >
                New estimate
              </Link>
            )}
          </div>
          {estimates.length === 0 ? (
            <p className="text-sm text-slate-500">No estimates yet.</p>
          ) : (
            <ul className="space-y-1">
              {estimates.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/dashboard/estimates/${e.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-slate-800">
                        EST-{String(e.docNumber).padStart(4, '0')}
                      </span>
                      <Badge tone={ESTIMATE_DOC_STATUS_TONE[e.status] ?? 'slate'}>{e.status}</Badge>
                    </span>
                    <span className="text-slate-600">{formatCurrency(e.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">
              Insurance scope
            </p>
            <Link
              href={`/dashboard/leads/${lead.id}/scope`}
              className="text-sm font-medium text-teal-600 hover:underline"
            >
              Upload &amp; review →
            </Link>
          </div>
          <p className="text-sm text-slate-500">
            AI-parse a carrier estimate PDF into draft financials.
          </p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">Contracts</p>
            {canManage && (
              <Link
                href={`/dashboard/contracts/new?leadId=${lead.id}`}
                className="text-sm font-medium text-teal-600 hover:underline"
              >
                New contract
              </Link>
            )}
          </div>
          {contracts.length === 0 ? (
            <p className="text-sm text-slate-500">No contracts yet.</p>
          ) : (
            <ul className="space-y-1">
              {contracts.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/contracts/${c.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-slate-800">
                        CON-{String(c.contractNumber).padStart(4, '0')}
                      </span>
                      <Badge tone={CONTRACT_STATUS_TONE[c.status] ?? 'slate'}>{c.status}</Badge>
                    </span>
                    <span className="text-slate-600">{formatCurrency(c.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">{label}</p>
      <p className="mt-0.5 text-slate-800">{value}</p>
    </div>
  );
}
