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
import { type BadgeTone, EmptyState, LinkButton } from '@/components/ui';
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import { formatDate } from '@/lib/format';
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGE_TONE, humanizeStatus } from '@/lib/status';
import type { LeadListRow } from '@/server/queries/leads-list';
import { archiveJobsAction } from '../jobs/actions';

const COLUMN_LABELS: Record<string, string> = {
  name: 'Name',
  address: 'Address',
  status: 'Status',
  createdAt: 'Date added',
  repName: 'Added by',
};

const DOT: Record<BadgeTone, string> = {
  slate: 'bg-slate-400',
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
};

export function LeadsQueue({ rows }: { rows: LeadListRow[] }) {
  // TanStack instance methods can't be memoized by React Compiler.
  'use no memo';
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const columns = useMemo<ColumnDef<LeadListRow>[]>(
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
        accessorKey: 'name',
        header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
        cell: ({ row }) => (
          <Link
            href={`/dashboard/jobs/${row.original.id}`}
            className="font-medium text-slate-900 hover:text-teal-600"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'address',
        header: 'Address',
        cell: ({ row }) => <span className="text-slate-600">{row.original.address ?? '—'}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge variant="outline">
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${DOT[PIPELINE_STAGE_TONE[row.original.status] ?? 'slate']}`}
            />
            <span className="capitalize">
              {PIPELINE_STAGE_LABELS[row.original.status] ?? humanizeStatus(row.original.status)}
            </span>
          </StatusBadge>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <SortHeader column={column}>Date added</SortHeader>,
        cell: ({ row }) => (
          <span className="text-slate-500">{formatDate(row.original.createdAt)}</span>
        ),
      },
      {
        accessorKey: 'repName',
        header: ({ column }) => <SortHeader column={column}>Added by</SortHeader>,
        cell: ({ row }) => <span className="text-slate-600">{row.original.repName ?? '—'}</span>,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
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
    initialState: { pagination: { pageSize: 25 } },
  });

  const filteredRows = table.getFilteredRowModel().rows;
  const selectedIds = table.getFilteredSelectedRowModel().rows.map((r) => r.original.id);
  const selectedCount = selectedIds.length;

  function deleteSelected() {
    if (selectedCount === 0) return;
    if (!confirm(`Archive ${selectedCount} lead${selectedCount === 1 ? '' : 's'}? (reversible)`))
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
    if (selectedCount === 1) router.push(`/dashboard/jobs/${selectedIds[0]}`);
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No leads yet"
        description="New leads show here until they get financials or an insurance scope, then they move to Jobs."
        action={<LinkButton href="/dashboard/jobs/new">New lead</LinkButton>}
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter by name, address, or rep…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-xs"
        />
        {globalFilter && (
          <Button variant="ghost" size="sm" onClick={() => setGlobalFilter('')}>
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
                title="Open"
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
          {selectedCount} of {filteredRows.length} lead(s) selected.
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
  );
}

function SortHeader({
  column,
  children,
}: {
  column: Column<LeadListRow, unknown>;
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
