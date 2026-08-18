'use client';

import {
  type Column,
  type ColumnDef,
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
import { type ReactNode, useMemo, useState, useTransition } from 'react';
import { Badge, EmptyState, LinkButton, PageHeader, StatCard } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { NewFromTemplate } from '@/components/estimate/new-from-template';
import { Checkbox } from '@/components/shadcn/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu';
import { Input } from '@/components/shadcn/input';
import { Card } from '@/components/ui/shadcn/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import { formatCurrency, formatDate } from '@/lib/format';
import { ESTIMATE_DOC_STATUS_TONE, toneFor } from '@/lib/status';
import type { EstimateDocListRow } from '@/server/queries/estimate-documents';
import type { SelectableLayout } from '@/server/queries/estimate-layouts';
import { createEstimateFromLayoutAction, deleteEstimateDocumentAction } from './doc-actions';

const COLUMN_LABELS: Record<string, string> = {
  docNumber: 'Number',
  name: 'Name',
  customerName: 'Customer',
  status: 'Status',
  total: 'Total',
  updatedAt: 'Updated',
};

export function EstimatesClient({
  estimates,
  layouts,
  canManage,
  canAdminLayouts,
}: {
  estimates: EstimateDocListRow[];
  layouts: SelectableLayout[];
  canManage: boolean;
  canAdminLayouts: boolean;
}) {
  // TanStack instance methods can't be safely memoized by React Compiler.
  'use no memo';
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'updatedAt', desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const openPipeline = estimates
    .filter((e) => e.status === 'draft' || e.status === 'sent')
    .reduce((s, e) => s + Number(e.total || 0), 0);
  const signedValue = estimates
    .filter((e) => e.status === 'signed')
    .reduce((s, e) => s + Number(e.total || 0), 0);

  function createFromLayout(layoutId: string) {
    setError('');
    startTransition(async () => {
      const res = await createEstimateFromLayoutAction(layoutId, {});
      if (!res.ok) setError(res.error);
      else if (res.id) router.push(`/dashboard/estimates/${res.id}`);
    });
  }

  const columns = useMemo<ColumnDef<EstimateDocListRow>[]>(
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
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(v === true)}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'docNumber',
        header: ({ column }) => <SortHeader column={column}>Number</SortHeader>,
        cell: ({ row }) => (
          <Link
            href={`/dashboard/estimates/${row.original.id}`}
            className="font-medium text-slate-900 hover:text-teal-600"
          >
            EST-{String(row.original.docNumber).padStart(4, '0')}
          </Link>
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
        cell: ({ row }) => (
          <Link
            href={`/dashboard/estimates/${row.original.id}`}
            className="text-slate-700 hover:text-teal-600"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'customerName',
        header: 'Customer',
        cell: ({ row }) => <span className="text-slate-600">{row.original.customerName ?? '—'}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge tone={toneFor(ESTIMATE_DOC_STATUS_TONE, row.original.status)}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'total',
        header: ({ column }) => (
          <div className="text-right">
            <SortHeader column={column}>Total</SortHeader>
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right font-medium text-slate-900">
            {formatCurrency(row.original.total)}
          </div>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => <SortHeader column={column}>Updated</SortHeader>,
        cell: ({ row }) => (
          <span className="text-xs text-slate-500">{formatDate(row.original.updatedAt)}</span>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: estimates,
    columns,
    state: { sorting, globalFilter, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
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
  const selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
  const selectedCount = selectedRows.length;
  const selectedDrafts = selectedRows.filter((e) => e.status === 'draft');

  function editSelected() {
    if (selectedCount === 1) router.push(`/dashboard/estimates/${selectedRows[0].id}`);
  }
  function deleteSelected() {
    setError('');
    if (selectedDrafts.length === 0) {
      setError('Only draft estimates can be deleted.');
      return;
    }
    const n = selectedDrafts.length;
    if (!confirm(`Delete ${n} draft estimate${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
    startTransition(async () => {
      for (const e of selectedDrafts) {
        const res = await deleteEstimateDocumentAction(e.id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
      }
      setRowSelection({});
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estimates"
        description={`${estimates.length} estimate${estimates.length === 1 ? '' : 's'}`}
        action={
          <div className="flex items-center gap-2">
            {canAdminLayouts && (
              <LinkButton href="/dashboard/estimate-layouts" variant="secondary">
                Templates
              </LinkButton>
            )}
            {canManage && (
              <NewFromTemplate
                layouts={layouts}
                label="New estimate"
                onChoose={createFromLayout}
                busy={isPending}
                canCreateTemplate={canAdminLayouts}
                newTemplateHref="/dashboard/estimate-layouts"
              />
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Estimates" value={String(estimates.length)} />
        <StatCard label="Open pipeline" value={formatCurrency(openPipeline)} />
        <StatCard label="Signed value" value={formatCurrency(signedValue)} />
      </div>

      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {estimates.length === 0 ? (
        <EmptyState
          title="No estimates"
          description="Start an estimate from a template to build a customer-facing packet."
          action={
            canManage ? (
              <LinkButton href="/dashboard/estimates/new">New estimate</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Toolbar: search + selection actions + columns */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Filter by name, customer, or number…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="max-w-xs"
            />
            {globalFilter && (
              <Button variant="ghost" size="sm" onClick={() => setGlobalFilter('')}>
                Clear
              </Button>
            )}

            {canManage && selectedCount > 0 && (
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
                  aria-label="Delete selected drafts"
                  title="Delete selected drafts"
                  className="rounded-md p-1 text-red-500 hover:bg-white hover:text-red-700 disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="ml-auto">
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
                    <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
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
            </Table>
          </Card>

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
        </>
      )}
    </div>
  );
}

// Sortable column header — click to toggle asc/desc.
function SortHeader({
  column,
  children,
}: {
  column: Column<EstimateDocListRow, unknown>;
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
