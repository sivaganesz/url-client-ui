import { cn } from '../../lib/cn'
import { EmptyState, ErrorState, Skeleton } from './States'

/**
 * Column: { key, header, width?, align?, mono?, muted?, className?, render? }

 * `width` drives a <colgroup>, so a wide table scrolls horizontally instead of
 * squashing every column to illegibility.
 *
 * `dense` (the default) fixes every row at one line and truncates — right for
 * scanning a long log. Set it false where a cell stacks several facts and the
 * row has to grow to fit them; cells then wrap and align to the top.
 */
export interface Column<T> {
  key: string
  header?: React.ReactNode
  /** Drives a <colgroup>, so a wide table scrolls rather than squashing. */
  width?: number
  align?: 'left' | 'right'
  mono?: boolean
  muted?: boolean
  className?: string
  render?: (row: T, index: number) => React.ReactNode
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: readonly T[]
  rowKey?: (row: T, index: number) => string | number
  loading?: boolean
  error?: Error | null
  onRetry?: () => void
  empty?: React.ReactNode
  footer?: React.ReactNode
  dense?: boolean
  className?: string
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey = (_, i) => i,
  loading = false,
  error = null,
  onRetry,
  empty,
  footer,
  dense = true,
  className,
}: DataTableProps<T>) {
  const colCount = columns.length

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card', className)}>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>

          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'sticky top-0 z-10 h-11 border-b border-line bg-sunken px-1.5 text-left align-middle',
                    'text-[9.5px] leading-tight font-semibold tracking-[0.05em] text-ink-3 uppercase',
                    'first:pl-4 last:pr-4',
                    c.align === 'right' && 'text-right',
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-line/60">
                  {columns.map((c) => (
                    <td key={c.key} className="h-[38px] px-1.5 first:pl-4 last:pr-4">
                      <Skeleton className="h-3" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={colCount}>{empty ?? <EmptyState title="Nothing here yet" />}</td>
              </tr>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={colCount}>
                  <ErrorState error={error} onRetry={onRetry} />
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              rows.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  className="border-b border-line/60 transition-colors last:border-b-0 hover:bg-sunken"
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-1.5 text-[11.5px] first:pl-4 last:pr-4',
                        dense
                          ? 'h-[38px] overflow-hidden text-ellipsis whitespace-nowrap'
                          : 'py-3 align-top',
                        c.mono && 'font-mono tabular-nums',
                        c.muted && 'text-ink-2',
                        c.align === 'right' && 'text-right',
                        c.className,
                      )}
                    >
                      {c.render ? c.render(row, i) : ((row as Record<string, React.ReactNode>)[c.key] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {footer && (
        <div className="flex h-12 shrink-0 items-center justify-between border-t border-line bg-sunken px-4 text-[11.5px] text-ink-3">
          {footer}
        </div>
      )}
    </div>
  )
}
