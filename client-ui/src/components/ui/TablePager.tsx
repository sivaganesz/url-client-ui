import Button from './Button'
import { Select } from './Field'
import { IconChevronLeft, IconChevronRight } from '../icons'
import { cn } from '../../lib/cn'
import { num } from '../../lib/format'
import type { Pagination } from '../../lib/usePagination'

/**
 * Footer controls for a paged list: page size on the left, range and
 * Previous/Next on the right.
 *
 * Takes the object `usePagination` returns, so the two stay in step and a
 * page can't quietly disagree with its own controls.
 */
export default function TablePager<T>({
  pager,
  noun = 'rows',
  loading = false,
  className,
}: {
  pager: Pagination<T>
  noun?: string
  loading?: boolean
  className?: string
}) {
  const { rows, sizes, perPage, setPerPage, page, pageCount, from, total, goto } = pager

  return (
    <div className={cn('flex w-full items-center justify-between gap-3', className)}>
      <Select
        label="Rows per page"
        size="sm"
        prefixLabel={false}
        value={String(perPage)}
        onChange={(v) => setPerPage(Number(v))}
        options={sizes.map((n) => ({ value: String(n), label: `${n} per page` }))}
      />

      <div className="flex items-center gap-3">
        <span aria-live="polite">
          {loading ? '' : total ? `${num(from + 1)}–${num(from + rows.length)} of ${num(total)}` : `No ${noun}`}
        </span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" disabled={page <= 1} onClick={() => goto(page - 1)}>
            <IconChevronLeft size={13} />
            Previous
          </Button>
          <Button size="sm" disabled={page >= pageCount} onClick={() => goto(page + 1)}>
            Next
            <IconChevronRight size={13} />
          </Button>
        </div>
      </div>
    </div>
  )
}
