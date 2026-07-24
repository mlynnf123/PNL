'use client';

import { Eye, Pencil, Trash2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  Badge,
  type BadgeTone,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import type { CallFields } from '@/server/commands/calls';
import type { CallRow } from '@/server/queries/calls';
import {
  type ActionResult,
  convertCallToLeadAction,
  deleteCallAction,
  logCallAction,
  updateCallAction,
} from './actions';

const STATUSES = ['completed', 'missed', 'busy', 'no_answer', 'voicemail'] as const;
const SUCCESS = ['success', 'partial', 'failed'] as const;

const STATUS_TONE: Record<string, BadgeTone> = {
  completed: 'teal',
  voicemail: 'blue',
  missed: 'red',
  busy: 'amber',
  no_answer: 'slate',
};
const SUCCESS_TONE: Record<string, BadgeTone> = {
  success: 'teal',
  partial: 'amber',
  failed: 'red',
};

function label(value: string): string {
  return value.replace(/_/g, ' ');
}
function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function formatDateTime(d: Date): string {
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function CallsClient({ calls, canManage }: { calls: CallRow[]; canManage: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [formCall, setFormCall] = useState<CallRow | null | undefined>(undefined);
  const [detail, setDetail] = useState<CallRow | null>(null);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return calls.filter((c) => {
      const matchesSearch =
        !q ||
        (c.customerName ?? '').toLowerCase().includes(q) ||
        c.customerPhone.includes(search) ||
        (c.customerEmail ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [calls, search, statusFilter]);

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

  const linked = (c: CallRow) => !!c.leadId;

  const actionButtons = (call: CallRow) => (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => setDetail(call)}
        title="View details"
        className="p-1.5 text-slate-400 transition-colors hover:text-slate-900"
      >
        <Eye size={16} />
      </button>
      {canManage && (
        <>
          <button
            type="button"
            onClick={() => setFormCall(call)}
            title="Edit call"
            className="p-1.5 text-slate-400 transition-colors hover:text-blue-600"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            disabled={linked(call)}
            onClick={() => {
              if (confirm(`Create a new lead from ${call.customerName || 'this caller'}?`)) {
                run(convertCallToLeadAction(call.id));
              }
            }}
            title={linked(call) ? 'Already linked to a lead' : 'Create lead from call'}
            className={`p-1.5 transition-colors ${linked(call) ? 'cursor-default text-teal-600' : 'text-slate-400 hover:text-teal-600'}`}
          >
            <UserPlus size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Delete this call? This cannot be undone.')) {
                run(deleteCallAction(call.id));
              }
            }}
            title="Delete call"
            className="p-1.5 text-slate-400 transition-colors hover:text-red-600"
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <h2 className="text-2xl font-medium tracking-tight text-slate-900">Call Management</h2>
          <div className="flex items-center gap-3">
            {canManage && <Button onClick={() => setFormCall(null)}>Log Call</Button>}
            <div className="flex rounded-lg bg-slate-100 p-1">
              {(['list', 'grid'] as const).map((v) => (
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
          </div>
        </div>

        {error && (
          <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
          <input
            type="text"
            placeholder="Search calls..."
            className="w-full flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <h3 className="mb-2 text-lg font-medium text-slate-900">No calls found</h3>
            <p className="text-sm text-slate-500">
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Click "Log Call" to track a call.'}
            </p>
          </div>
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {['Customer', 'Phone', 'Status', 'Duration', 'Call Time', 'Result', ''].map(
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
                  {filtered.map((call) => (
                    <tr
                      key={call.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-6 py-3">
                        <div className="font-medium text-slate-900">
                          {call.customerName || 'Unknown Caller'}
                        </div>
                        {call.customerEmail && (
                          <div className="text-xs text-slate-500">{call.customerEmail}</div>
                        )}
                      </td>
                      <td className="px-6 py-3 text-slate-700">{call.customerPhone}</td>
                      <td className="px-6 py-3">
                        <Badge tone={STATUS_TONE[call.status]}>{label(call.status)}</Badge>
                      </td>
                      <td className="px-6 py-3 text-slate-700">{formatDuration(call.duration)}</td>
                      <td className="px-6 py-3 text-slate-700">{formatDateTime(call.startTime)}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <Badge tone={SUCCESS_TONE[call.callSuccessful]}>
                            {call.callSuccessful}
                          </Badge>
                          {call.appointmentBooked && <Badge tone="blue">booked</Badge>}
                          {linked(call) && <Badge tone="teal">lead</Badge>}
                        </div>
                      </td>
                      <td className="px-6 py-3">{actionButtons(call)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {filtered.map((call) => (
              <div
                key={call.id}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-slate-900">
                      {call.customerName || 'Unknown Caller'}
                    </h3>
                    <p className="text-sm text-slate-600">{call.customerPhone}</p>
                  </div>
                  <Badge tone={STATUS_TONE[call.status]}>{label(call.status)}</Badge>
                </div>
                <div className="mb-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Duration</span>
                    <span className="text-slate-900">{formatDuration(call.duration)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Time</span>
                    <span className="text-slate-900">{formatDateTime(call.startTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Result</span>
                    <Badge tone={SUCCESS_TONE[call.callSuccessful]}>{call.callSuccessful}</Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {call.appointmentBooked && <Badge tone="blue">booked</Badge>}
                    {linked(call) && <Badge tone="teal">lead</Badge>}
                  </div>
                  {actionButtons(call)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formCall !== undefined && (
        <CallFormModal
          call={formCall}
          pending={isPending}
          onClose={() => setFormCall(undefined)}
          onSubmit={(fields) => {
            const action = formCall
              ? updateCallAction(formCall.id, formCall.rowVersion, fields)
              : logCallAction(fields);
            run(action, () => setFormCall(undefined));
          }}
        />
      )}

      <CallDetailModal call={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function CallFormModal({
  call,
  pending,
  onClose,
  onSubmit,
}: {
  call: CallRow | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (fields: CallFields) => void;
}) {
  const [booked, setBooked] = useState(call?.appointmentBooked ?? false);
  const startDefault = call ? toLocalInput(call.startTime) : toLocalInput(new Date());

  return (
    <Modal
      open
      onClose={onClose}
      title={call ? 'Edit call' : 'Log call'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="call-form" disabled={pending}>
            {call ? 'Save changes' : 'Log call'}
          </Button>
        </>
      }
    >
      <form
        id="call-form"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const minutes = Number(d.get('durationMinutes') ?? 0);
          const fields: CallFields = {
            customerName: String(d.get('customerName') ?? ''),
            customerPhone: String(d.get('customerPhone') ?? ''),
            customerEmail: String(d.get('customerEmail') ?? ''),
            status: d.get('status') as CallFields['status'],
            callSuccessful: d.get('callSuccessful') as CallFields['callSuccessful'],
            duration: Math.round((Number.isFinite(minutes) ? minutes : 0) * 60),
            startTime: new Date(String(d.get('startTime'))).toISOString(),
            summary: String(d.get('summary') ?? ''),
            notes: String(d.get('notes') ?? ''),
            appointmentBooked: booked,
            appointmentDetails: booked
              ? {
                  date: String(d.get('apptDate') ?? ''),
                  time: String(d.get('apptTime') ?? ''),
                  address: String(d.get('apptAddress') ?? ''),
                  serviceType: String(d.get('apptService') ?? ''),
                  notes: String(d.get('apptNotes') ?? '') || undefined,
                }
              : null,
          };
          onSubmit(fields);
        }}
      >
        <FormField label="Customer name">
          <Input name="customerName" defaultValue={call?.customerName ?? ''} />
        </FormField>
        <FormField label="Phone">
          <Input name="customerPhone" required defaultValue={call?.customerPhone ?? ''} />
        </FormField>
        <FormField label="Email">
          <Input name="customerEmail" type="email" defaultValue={call?.customerEmail ?? ''} />
        </FormField>
        <FormField label="Call time">
          <Input name="startTime" type="datetime-local" defaultValue={startDefault} required />
        </FormField>
        <FormField label="Status">
          <Select name="status" defaultValue={call?.status ?? 'completed'}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Result">
          <Select name="callSuccessful" defaultValue={call?.callSuccessful ?? 'success'}>
            {SUCCESS.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Duration (minutes)">
          <Input
            name="durationMinutes"
            type="number"
            min="0"
            step="0.5"
            defaultValue={call ? String(call.duration / 60) : '0'}
          />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Summary">
            <Textarea name="summary" rows={2} defaultValue={call?.summary ?? ''} />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Notes">
            <Textarea name="notes" rows={2} defaultValue={call?.notes ?? ''} />
          </FormField>
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={booked} onChange={(e) => setBooked(e.target.checked)} />
            Appointment booked
          </label>
        </div>
        {booked && (
          <>
            <FormField label="Appointment date">
              <Input
                name="apptDate"
                type="date"
                defaultValue={call?.appointmentDetails?.date ?? ''}
              />
            </FormField>
            <FormField label="Appointment time">
              <Input
                name="apptTime"
                type="time"
                defaultValue={call?.appointmentDetails?.time ?? ''}
              />
            </FormField>
            <FormField label="Address">
              <Input name="apptAddress" defaultValue={call?.appointmentDetails?.address ?? ''} />
            </FormField>
            <FormField label="Service type">
              <Input
                name="apptService"
                defaultValue={call?.appointmentDetails?.serviceType ?? ''}
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Appointment notes">
                <Input name="apptNotes" defaultValue={call?.appointmentDetails?.notes ?? ''} />
              </FormField>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

function CallDetailModal({ call, onClose }: { call: CallRow | null; onClose: () => void }) {
  if (!call) return null;
  return (
    <Modal
      open={!!call}
      onClose={onClose}
      title={`Call — ${call.customerName || 'Unknown Caller'}`}
      size="xl"
    >
      <div className="space-y-5 text-sm">
        <p className="text-slate-500">
          {call.customerPhone} · {formatDateTime(call.startTime)} · {formatDuration(call.duration)}
        </p>

        {call.summary && (
          <div className="rounded-lg bg-slate-50 p-4">
            <h4 className="mb-1 font-medium text-slate-900">Summary</h4>
            <p className="text-slate-700">{call.summary}</p>
          </div>
        )}
        {call.notes && (
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
            <h4 className="mb-1 font-medium text-slate-900">Notes</h4>
            <p className="whitespace-pre-wrap text-slate-700">{call.notes}</p>
          </div>
        )}

        {call.transcript.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-slate-900">Transcript</h4>
            {call.transcript.map((entry, i) => (
              <div
                key={i}
                className={`flex ${entry.role === 'agent' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-md rounded-lg px-4 py-2 ${
                    entry.role === 'agent'
                      ? 'bg-slate-100 text-slate-900'
                      : 'bg-slate-800 text-white'
                  }`}
                >
                  <div className="mb-1 text-xs opacity-75">
                    {entry.role === 'agent' ? 'Agent' : 'Customer'} ·{' '}
                    {Math.floor(entry.timeInCallSecs / 60)}m {entry.timeInCallSecs % 60}s
                  </div>
                  <div>{entry.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {call.appointmentDetails && (
          <div className="rounded-lg bg-slate-50 p-4">
            <h4 className="mb-2 font-medium text-slate-900">Appointment</h4>
            <div className="space-y-1 text-slate-700">
              <p>Date: {call.appointmentDetails.date}</p>
              <p>Time: {call.appointmentDetails.time}</p>
              <p>Address: {call.appointmentDetails.address}</p>
              <p>Service: {call.appointmentDetails.serviceType}</p>
              {call.appointmentDetails.notes && <p>Notes: {call.appointmentDetails.notes}</p>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
