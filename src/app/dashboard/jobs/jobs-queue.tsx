'use client';

import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronLeft, ChevronRight, Pencil, SlidersHorizontal, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState, useTransition } from 'react';
import { Badge, type BadgeTone, Drawer, EmptyState, LinkButton } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/shadcn/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu';
import { Input } from '@/components/shadcn/input';
import { Badge as StatusBadge } from '@/components/ui/shadcn/badge';
import { Card } from '@/components/ui/shadcn/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import { formatCurrency, formatDate, formatRelative } from '@/lib/format';
import {
  JOB_CLOSE_TONE,
  JOB_COLLECTION_TONE,
  JOB_COMMISSION_TONE,
  JOB_OPERATIONAL_TONE,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_TONE,
  humanizeStatus,
  toneFor,
} from '@/lib/status';
import type { JobListRow } from '@/server/queries/jobs-list';
import { archiveJobsAction } from './actions';
import { getJobHistoryAction } from './history-actions';
import type { JobHistoryRow, LastEditView } from './jobs-history-types';

// Friendly labels for the column-visibility menu (keyed by column id).
const COLUMN_LABELS: Record<string, string> = {
  jobNumber: 'Job',
  customerName: 'Customer',
  reps: 'Rep',
  productionPhase: 'Stage',
  contractedAt: 'Contracted',
  originalContractAmount: 'Contract',
  collectionStatus: 'Collection',
  financialCloseStatus: 'Close',
  lastEdited: 'Last edited',
};

export function JobsQueue({
  rows,
  lastEdited,
  importSlot,
}: {
  rows: JobListRow[];
  lastEdited: Record<string, LastEditView>;
  importSlot?: ReactNode;
}) {
  // TanStack Table's instance methods can't be safely memoized by React Compiler
  // (row selection / filters would go stale). Opt this component out.
  'use no memo';
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<JobListRow | null>(null);
  const [history, setHistory] = useState<JobHistoryRow[] | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  function openPreview(row: JobListRow) {
    setPreview(row);
    setHistory(null);
  }
  function closePreview() {
    setPreview(null);
    setHistory(null);
  }

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    getJobHistoryAction(preview.id).then((h) => {
      if (!cancelled) setHistory(h);
    });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const columns = useMemo<ColumnDef<JobListRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
          />
        ),
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()} className="flex items-center">
            <Checkbox
              aria-label="Select row"
              checked={row.getIsSelected()}
              onCheckedChange={(v) => row.toggleSelected(v === true)}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'jobNumber',
        header: ({ column }) => <SortHeader column={column}>Job</SortHeader>,
        cell: ({ row }) => (
          <Link
            href={`/dashboard/jobs/${row.original.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-slate-900 hover:text-teal-600"
          >
            {row.original.jobNumber ?? (
              <StatusPill tone="slate">Lead — pre-contract</StatusPill>
            )}
          </Link>
        ),
      },
      {
        accessorKey: 'customerName',
        header: ({ column }) => <SortHeader column={column}>Customer</SortHeader>,
        cell: ({ row }) =>
          row.original.customerName ? (
            <Link
              href={`/dashboard/jobs/${row.original.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-slate-700 hover:text-teal-600"
            >
              {row.original.customerName}
            </Link>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        id: 'reps',
        header: 'Rep',
        enableSorting: false,
        cell: ({ row }) => {
          const reps = row.original.reps ?? [];
          if (reps.length === 0) return <span className="text-slate-400">—</span>;
          if (reps.length === 1) return <span className="text-slate-700">{reps[0]}</span>;
          // Multiple reps → count with the names on hover.
          return (
            <span
              title={reps.join(', ')}
              className="inline-flex cursor-help items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
            >
              {reps.length} reps
            </span>
          );
        },
      },
      {
        accessorKey: 'productionPhase',
        header: 'Stage',
        enableSorting: false,
        cell: ({ row }) => (
          <StatusPill tone={PIPELINE_STAGE_TONE[row.original.productionPhase] ?? 'slate'}>
            {PIPELINE_STAGE_LABELS[row.original.productionPhase] ??
              humanizeStatus(row.original.productionPhase)}
          </StatusPill>
        ),
      },
      {
        accessorKey: 'contractedAt',
        header: ({ column }) => <SortHeader column={column}>Contracted</SortHeader>,
        cell: ({ row }) => (
          <span className="text-slate-500">{formatDate(row.original.contractedAt)}</span>
        ),
        // [from, to] inclusive date-window filter; undated rows only show with no window.
        filterFn: (row, columnId, value: [string, string]) => {
          const [from, to] = value ?? ['', ''];
          if (!from && !to) return true;
          const raw = row.getValue<string | Date | null>(columnId);
          if (!raw) return false;
          const d = String(raw).slice(0, 10);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        },
      },
      {
        accessorKey: 'originalContractAmount',
        header: ({ column }) => (
          <div className="text-right">
            <SortHeader column={column}>Contract</SortHeader>
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right text-slate-700">
            {row.original.originalContractAmount
              ? formatCurrency(row.original.originalContractAmount)
              : '—'}
          </div>
        ),
      },
      {
        accessorKey: 'collectionStatus',
        header: 'Collection',
        enableSorting: false,
        cell: ({ row }) => (
          <StatusPill tone={toneFor(JOB_COLLECTION_TONE, row.original.collectionStatus)}>
            {humanizeStatus(row.original.collectionStatus)}
          </StatusPill>
        ),
      },
      {
        accessorKey: 'financialCloseStatus',
        header: 'Close',
        enableSorting: false,
        cell: ({ row }) => (
          <StatusPill tone={toneFor(JOB_CLOSE_TONE, row.original.financialCloseStatus)}>
            {humanizeStatus(row.original.financialCloseStatus)}
          </StatusPill>
        ),
      },
      {
        id: 'lastEdited',
        header: 'Last edited',
        enableSorting: false,
        cell: ({ row }) => {
          const le = lastEdited[row.original.id];
          return (
            <span className="text-xs whitespace-nowrap text-slate-500">
              {le ? `${le.actorName ?? 'system'} · ${formatRelative(le.occurredAt)}` : '—'}
            </span>
          );
        },
      },
    ],
    [lastEdited],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, columnFilters, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const filteredRows = table.getFilteredRowModel().rows;
  // Footer total for the filtered set — integer cents so the display sum is exact.
  const total =
    filteredRows.reduce(
      (cents, r) => cents + Math.round(Number(r.original.originalContractAmount ?? 0) * 100),
      0,
    ) / 100;
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  // Client-side "Contracted" date window, held on the contractedAt column filter.
  const dateWindow = ((table.getColumn('contractedAt')?.getFilterValue() as
    | [string, string]
    | undefined) ?? ['', '']) as [string, string];
  const setDateWindow = (idx: 0 | 1, val: string) => {
    const next: [string, string] = [dateWindow[0], dateWindow[1]];
    next[idx] = val;
    table.getColumn('contractedAt')?.setFilterValue(next[0] || next[1] ? next : undefined);
  };
  const hasFilters = Boolean(globalFilter || dateWindow[0] || dateWindow[1]);
  const clearFilters = () => {
    setGlobalFilter('');
    table.getColumn('contractedAt')?.setFilterValue(undefined);
  };

  const selectedIds = table.getFilteredSelectedRowModel().rows.map((r) => r.original.id);
  function deleteSelected() {
    if (selectedIds.length === 0) return;
    const n = selectedIds.length;
    if (!confirm(`Archive ${n} selected record${n === 1 ? '' : 's'}? They'll be hidden from the pipeline (reversible).`))
      return;
    startTransition(async () => {
      const res = await archiveJobsAction(selectedIds);
      if (res.ok) {
        setRowSelection({});
        router.refresh();
      }
    });
  }
  function editSelected() {
    if (selectedIds.length === 1) router.push(`/dashboard/jobs/${selectedIds[0]}`);
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No jobs in this range"
        description="Nothing matches the current filters. Widen the date range or turn on “All time”, or create a new job."
        action={<LinkButton href="/dashboard/jobs/new">New job</LinkButton>}
      />
    );
  }

  return (
    <>
      {/* Toolbar: search + contracted-date window + selection actions + import + columns */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter by job number or customer…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
        <Input
          type="date"
          aria-label="Contracted from"
          value={dateWindow[0]}
          onChange={(e) => setDateWindow(0, e.target.value)}
          className="w-[9.5rem] text-slate-600"
        />
        <span className="text-sm text-slate-400">–</span>
        <Input
          type="date"
          aria-label="Contracted to"
          value={dateWindow[1]}
          onChange={(e) => setDateWindow(1, e.target.value)}
          className="w-[9.5rem] text-slate-600"
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}

        {selectedCount > 0 && (
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
            <span className="text-sm text-slate-600">{selectedCount} selected</span>
            {selectedCount === 1 && (
              <button
                type="button"
                onClick={editSelected}
                disabled={isPending}
                aria-label="Edit selected"
                title="Edit"
                className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-800 disabled:opacity-50"
              >
                <Pencil size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={deleteSelected}
              disabled={isPending}
              aria-label="Delete selected"
              title="Archive selected"
              className="rounded-md p-1 text-red-500 hover:bg-white hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {importSlot}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                <SlidersHorizontal size={14} /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={c.getIsVisible()}
                    onCheckedChange={(v) => c.toggleVisibility(!!v)}
                  >
                    {COLUMN_LABELS[c.id] ?? c.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card className="mt-3 overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  onClick={() => openPreview(row.original)}
                  className="cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={table.getVisibleFlatColumns().length}
                  className="h-20 text-center text-slate-400"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell
                colSpan={Math.max(1, table.getVisibleFlatColumns().length - 1)}
                className="text-slate-600"
              >
                Total contract value
              </TableCell>
              <TableCell className="text-right text-slate-900">{formatCurrency(total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="text-sm text-slate-500">
          {selectedCount} of {filteredRows.length} row(s) selected.
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      {/* Preview sheet: scan -> preview -> commit */}
      <Drawer
        open={!!preview}
        onClose={closePreview}
        title={preview ? (preview.jobNumber ?? preview.customerName ?? 'New lead') : ''}
        footer={
          preview ? (
            <LinkButton href={`/dashboard/jobs/${preview.id}`}>Open full record</LinkButton>
          ) : undefined
        }
      >
        {preview && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge tone={toneFor(JOB_OPERATIONAL_TONE, preview.operationalStatus)}>
                {humanizeStatus(preview.operationalStatus)}
              </Badge>
              <Badge tone={toneFor(JOB_CLOSE_TONE, preview.financialCloseStatus)}>
                {humanizeStatus(preview.financialCloseStatus)}
              </Badge>
              <Badge tone={toneFor(JOB_COMMISSION_TONE, preview.commissionStatus)}>
                {humanizeStatus(preview.commissionStatus)}
              </Badge>
            </div>
            <Detail label="Customer" value={preview.customerName ?? '—'} />
            <Detail
              label={preview.originalContractAmount ? 'Contract amount' : 'Estimated value'}
              value={formatCurrency(preview.originalContractAmount ?? preview.estimatedValue)}
            />
            <Detail
              label="Funding"
              value={preview.fundingType ? humanizeStatus(preview.fundingType) : '—'}
            />
            <Detail label="Contracted" value={formatDate(preview.contractedAt)} />
            <Detail label="Collection" value={humanizeStatus(preview.collectionStatus)} />

            <div>
              <p className="mb-2 text-xs font-medium tracking-wider text-slate-400 uppercase">
                History
              </p>
              {history === null && <p className="text-slate-400">Loading…</p>}
              {history && history.length === 0 && (
                <p className="text-slate-400">No recorded changes yet.</p>
              )}
              {history && history.length > 0 && (
                <ol className="space-y-3">
                  {history.map((h) => (
                    <li key={h.id} className="border-l-2 border-slate-200 pl-3">
                      <div className="text-slate-800">{humanizeAudit(h.action)}</div>
                      <div className="text-xs text-slate-500">
                        {h.actorName ?? 'system'} · {formatRelative(h.occurredAt)}
                      </div>
                      <Delta row={h} />
                      {h.reason && <div className="mt-0.5 text-xs text-slate-400">{h.reason}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

// Sortable column header — click to toggle asc/desc.
function SortHeader({
  column,
  children,
}: {
  column: Column<JobListRow, unknown>;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      className="inline-flex items-center gap-1 hover:text-slate-700"
    >
      {children}
      <ArrowUpDown size={12} className="opacity-50" />
    </button>
  );
}

// Status dot colors, keyed by the app's semantic tone.
const DOT: Record<BadgeTone, string> = {
  slate: 'bg-slate-400',
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
};

// A neutral outline pill with a tone-colored status dot (shadcn Badge).
function StatusPill({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <StatusBadge variant="outline">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${DOT[tone]}`} />
      <span className="capitalize">{children}</span>
    </StatusBadge>
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

function humanizeAudit(s: string): string {
  return s.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtVal(v: unknown): string {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

// The old→new field deltas an audit event recorded.
function Delta({ row }: { row: JobHistoryRow }) {
  const prev = row.previousState ?? {};
  const next = row.newState ?? {};
  const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));
  if (keys.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs">
      {keys.map((k) => {
        const before = (prev as Record<string, unknown>)[k];
        const after = (next as Record<string, unknown>)[k];
        const isNew = !(k in prev);
        return (
          <div key={k} className="text-slate-500">
            {humanizeAudit(k)}:{' '}
            {!isNew && <span className="text-slate-400 line-through">{fmtVal(before)}</span>}{' '}
            <span className="text-slate-700">{fmtVal(after)}</span>
          </div>
        );
      })}
    </div>
  );
}
