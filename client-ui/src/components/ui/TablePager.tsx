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
    /**
     * One row on a phone as well as a desktop.
     *
     * Page size, range and two worded buttons need about 420px, which no phone
     * has, so it used to wrap into a second line inside the footer. Instead the
     * page size keeps the left, the range centres between them, and the buttons
     * hold the right edge as arrows alone. From `sm` up the range rejoins the
     * buttons and they get their words back, which is the layout every table
     * already had.
     */
    <div className={cn('flex w-full items-center gap-x-2 gap-y-2 sm:gap-x-3', className)}>
      <Select
        label="Rows per page"
        size="sm"
        prefixLabel={false}
        value={String(perPage)}
        onChange={(v) => setPerPage(Number(v))}
        // "100 per page" sets the width of the closed select for every option,
        // and those 25px are what pushed the total off a 320px screen.
        options={sizes.map((n) => ({ value: String(n), label: `${n} / page` }))}
        className="shrink-0"
      />

      {/* Takes the space between the two controls on a phone, which centres it
          and leaves it the one part that gives way when the row is short —
          rather than the row folding in two. From `sm` it sits beside the
          buttons again. */}
      <span
        aria-live="polite"
        className="min-w-0 flex-1 truncate text-center sm:ml-auto sm:flex-none sm:text-left"
      >
        {loading ? '' : total ? `${num(from + 1)}–${num(from + rows.length)} of ${num(total)}` : `No ${noun}`}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
        {/* Labelled either way: the words are hidden below `sm`, not the
            button's name. */}
        <Button size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => goto(page - 1)}>
          <IconChevronLeft size={13} />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <Button size="sm" aria-label="Next page" disabled={page >= pageCount} onClick={() => goto(page + 1)}>
          <span className="hidden sm:inline">Next</span>
          <IconChevronRight size={13} />
        </Button>
      </div>
    </div>
  )
}
