import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { Button } from "@workspace/ui/components/Button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/DropdownMenu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/Table"
import { ArrowDown, ArrowUp, Check, ChevronsUpDown, EyeOff } from "lucide-react"
import { useState } from "react"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function DataTable<TData, TValue>({ columns, data }: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])

  // TanStack Table's useReactTable() returns functions that can't be
  // memoized safely - the React Compiler already detects this and skips
  // optimizing this component on its own, so this just silences the
  // resulting advisory warning.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="overflow-hidden overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortDir = header.column.getIsSorted()

                return (
                  <TableHead key={header.id}>
                    {header.column.getCanSort() ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ChevronsUpDown className="size-3" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => header.column.toggleSorting(false)}>
                              <ArrowUp />
                              <div className="flex w-full items-center justify-between">
                                <span>Asc</span>
                                <span>{sortDir === "asc" && <Check />}</span>
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => header.column.toggleSorting(true)}>
                              <ArrowDown />
                              <div className="flex w-full items-center justify-between">
                                <span>Desc</span>
                                <span>{sortDir === "desc" && <Check />}</span>
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => header.column.toggleVisibility(false)}>
                              <EyeOff />
                              <span>Hide</span>
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                /* v8 ignore next - row selection state is never configured on this table, so getIsSelected() is always false */
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="pl-5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
