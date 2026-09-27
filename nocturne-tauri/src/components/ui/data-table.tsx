import type { Key, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { Skeleton } from './skeleton'

export interface DataColumn<T> {
  key: string
  header: ReactNode
  headerClassName?: string
  cellClassName?: string
  render: (row: T, index: number) => ReactNode
  renderSkeleton?: () => ReactNode
}

export interface DataTableProps<T> {
  columns?: DataColumn<T>[]
  rows?: T[]
  getRowKey?: (row: T, index: number) => Key
  onRowClick?: (row: T, index: number) => void
  onRowContextMenu?: (row: T, index: number, event: ReactMouseEvent) => void
  isRowActive?: (row: T) => boolean
  isRowDisabled?: (row: T) => boolean
  disabledTitle?: string
  ariaLabel?: string
  loading?: boolean
  loadingRowCount?: number
}

/**
 * Minimal semantic data table on Nocturne tokens.
 * Sticky header, fixed layout for reliable ellipsis truncation, LTR columns.
 * Built with full defensive guards against empty/undefined arrays and missing fields.
 */
export function DataTable<T>({
  columns = [],
  rows = [],
  getRowKey,
  onRowClick,
  onRowContextMenu,
  isRowActive,
  isRowDisabled,
  disabledTitle,
  ariaLabel = 'Data table',
  loading = false,
  loadingRowCount = 6
}: DataTableProps<T>): JSX.Element {
  const safeColumns = Array.isArray(columns) ? columns : []
  const safeRows = Array.isArray(rows) ? rows : []

  return (
    /* min-w-0 + w-full + overflow-x-hidden: without min-w-0 this flex child
       keeps its content's intrinsic width, so during a maximize/restore the
       table refused to shrink and pushed the 320px queue column off-screen.
       `table-fixed` below then distributes the available width instead. */
    <div
      className="min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto bg-[#121419]/95"
      role="grid"
      aria-label={ariaLabel}
    >
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-[#121419] border-b border-white/10 backdrop-blur-md">
          <tr>
            {safeColumns.map((col, i) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'border-b border-white/10 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-faint',
                  'truncate whitespace-nowrap',
                  i === 0 && 'pl-5',
                  i === safeColumns.length - 1 && 'pr-5',
                  col.headerClassName
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.map((row, index) => {
            if (row === null || row === undefined) return null
            const active = isRowActive ? isRowActive(row) : false
            const disabled = isRowDisabled ? isRowDisabled(row) : false
            const key = getRowKey ? getRowKey(row, index) : index

            return (
              <tr
                key={key}
                onClick={() => {
                  if (!disabled && onRowClick) onRowClick(row, index)
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  if (onRowContextMenu) onRowContextMenu(row, index, e)
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !disabled && onRowClick) {
                    e.preventDefault()
                    onRowClick(row, index)
                  }
                }}
                tabIndex={disabled ? -1 : 0}
                aria-selected={active}
                title={disabled ? disabledTitle : undefined}
                className={cn(
                  'group h-14 border-b border-white/[0.05] hover:bg-white/[0.04] transition-colors',
                  disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                  active && 'bg-white/[0.06]'
                )}
              >
                {safeColumns.map((col, i) => (
                  <td
                    key={col.key}
                    className={cn(
                      'overflow-hidden px-4',
                      i === 0 && 'pl-5',
                      i === safeColumns.length - 1 && 'pr-5',
                      active && i === 0 && 'border-l-2 border-l-ember pl-[18px]',
                      col.cellClassName
                    )}
                  >
                    {col.render(row, index)}
                  </td>
                ))}
              </tr>
            )
          })}
          {loading &&
            Array.from({ length: loadingRowCount }).map((_, idx) => (
              <tr
                key={`skeleton-row-${idx}`}
                className="h-14 border-b border-white/[0.05]"
                aria-hidden="true"
              >
                {safeColumns.map((col, i) => (
                  <td
                    key={`skeleton-cell-${col.key}-${idx}`}
                    className={cn(
                      'overflow-hidden px-4',
                      i === 0 && 'pl-5',
                      i === safeColumns.length - 1 && 'pr-5',
                      col.cellClassName
                    )}
                  >
                    {col.renderSkeleton ? (
                      col.renderSkeleton()
                    ) : i === 0 ? (
                      <Skeleton variant="shimmer" className="h-4 w-4" />
                    ) : i === 1 ? (
                      <Skeleton variant="shimmer" className="h-4 w-3/4 max-w-[220px]" />
                    ) : i === 2 ? (
                      <Skeleton variant="shimmer" className="h-3.5 w-1/2 max-w-[180px]" />
                    ) : i === 3 ? (
                      <Skeleton variant="shimmer" className="ml-auto h-4 w-12" />
                    ) : (
                      <Skeleton variant="shimmer" className="h-7 w-7 rounded-md" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
