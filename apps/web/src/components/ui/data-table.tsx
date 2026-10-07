/**
 * Sortable data table.
 *
 * Built on TanStack Table rather than hand-rolled because the lists this
 * product shows are the ones that grow: a plan can hold 50,000 items and a
 * tenant can hold many plans, and a table that only works while everything
 * fits on one screen is a table that will be replaced later.
 *
 * Sorting is client-side over what the query already returned. That is a
 * deliberate limit, not an oversight: the API has no paginated list
 * endpoint yet, so pretending to sort server-side would mean sorting a
 * page and calling it the whole list. When the API grows pagination, this
 * component keeps its props and the sorting moves into the query.
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface DataTableProps<TData, TValue = unknown> {
  readonly data: readonly TData[];
  /**
   * `TValue` is explicit because `ColumnDef<TData>` defaults it to
   * `unknown`, and a `ColumnDef<TData, string>` is not assignable to that —
   * the accessor function is contravariant in its value type. Letting the
   * caller's columns decide keeps the cell renderers typed.
   */
  readonly columns: ReadonlyArray<ColumnDef<TData, TValue>>;
  /** TanStack needs a stable string id per row; the entity id is that. */
  readonly getRowId: (row: TData) => string;
  readonly initialSorting?: SortingState;
  /** Shown instead of the body when there are no rows. */
  readonly empty?: ReactNode;
}

export function DataTable<TData, TValue = unknown>({
  data,
  columns,
  getRowId,
  initialSorting = [],
  empty,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  // A fresh array each render: TanStack Table holds the reference it is
  // given, and a readonly prop would be a lie about what it does with it.
  const rows = useMemo(() => [...data], [data]);

  const table = useReactTable({
    data: rows,
    columns,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const canSort = header.column.getCanSort();
              const direction = header.column.getIsSorted();

              return (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : canSort ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground"
                      title={
                        direction === false
                          ? 'Ordenar'
                          : direction === 'asc'
                            ? 'Orden ascendente, clic para descendente'
                            : 'Orden descendente, clic para quitar'
                      }
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {direction === 'asc' ? (
                        <ArrowUp className="size-3" aria-hidden />
                      ) : direction === 'desc' ? (
                        <ArrowDown className="size-3" aria-hidden />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                      )}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length === 0 && empty !== undefined ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="p-0">
              {empty}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
