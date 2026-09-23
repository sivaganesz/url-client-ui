import { useId } from 'react'
import Card from './ui/Card'
import DateFilter from './ui/DateFilter'
import FilterMenu, { type FilterOption } from './ui/FilterMenu'
import { IconFlag, IconSearch, IconX, channelIcon } from './icons'
import { cn } from '../lib/cn'
import { NO_FILTERS } from '../lib/shapes'
import type { LogFilterValues } from '../lib/types'

/** Whether anything is being held back, without a term per filter to forget. */
const isFiltered = (v: LogFilterValues) =>
  (Object.keys(NO_FILTERS) as (keyof LogFilterValues)[]).some((k) => v[k] !== NO_FILTERS[k])

/**
 * Values the API understands, labels a person reads.
 *
 * The workspace speaks lowercase — `status=ended`, `channel=whatsapp` — which
 * the old pills showed raw, so the bar read like a query string.
 */
const STATUS: FilterOption[] = [
  { value: 'All', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'ended', label: 'Ended' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'abandoned', label: 'Abandoned' },
]

const CHANNEL: FilterOption[] = [
  { value: 'All', label: 'Any channel' },
  { value: 'web', label: 'Web', icon: channelIcon.Web },
  { value: 'phone', label: 'Phone', icon: channelIcon.Phone },
  { value: 'whatsapp', label: 'WhatsApp', icon: channelIcon.WhatsApp },
  { value: 'sms', label: 'SMS', icon: channelIcon.SMS },
  { value: 'email', label: 'Email', icon: channelIcon.Email },
]

const ORIGINATOR: FilterOption[] = [
  { value: 'All', label: 'Anyone' },
  { value: 'customer', label: 'Customer' },
  { value: 'agent', label: 'Agent' },
  { value: 'system', label: 'System' },
]

/**
 * The conversation log's filter bar.
 *
 * It was three unlabelled rows of pills — fifteen of them, each row starting
 * with its own "All", none of them saying which question it answered — over a
 * bare pair of date boxes. This is one line: the search the bar is built
 * around, then a control per question that states both the question and the
 * answer, and a way out when a filter has been left on and the table looks
 * empty for no visible reason.
 */
export default function LogFilters({
  value,
  onChange,
  className,
}: {
  value: LogFilterValues
  onChange: (patch: Partial<LogFilterValues>) => void
  className?: string
}) {
  const searchId = useId()
  const dirty = isFiltered(value)

  return (
    <Card className={cn('flex flex-wrap items-center gap-1.5 p-1.5', className)}>
      {/* Borderless: the card is the box, and a second one drawn inside it is
          the thing that made this section look like a form. */}
      {/* Its own row on a phone: a search box sharing a line with a filter pill
          truncates the placeholder to "Search name, email, pho". */}
      <div className="relative flex h-9 w-full items-center sm:w-auto sm:min-w-[180px] sm:flex-1">
        <label htmlFor={searchId} className="sr-only">
          Search cases
        </label>
        <IconSearch size={14} className="pointer-events-none absolute left-2.5 text-ink-4" />
        <input
          id={searchId}
          type="search"
          placeholder="Search name, email, phone or case id"
          value={value.q}
          onChange={(e) => onChange({ q: e.target.value })}
          className="h-9 w-full rounded-full border border-transparent bg-transparent pr-3 pl-8 text-[12.5px] text-ink transition-colors placeholder:text-ink-4 hover:border-line-strong focus:border-brand focus:bg-surface focus:outline-none"
        />
      </div>

      <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-line sm:block" />

      {/* Channel first: it is how people say which conversations they mean
          ("the WhatsApp ones") before they say what state those are in. */}
      <FilterMenu
        label="Channel"
        value={value.channel}
        options={CHANNEL}
        onChange={(channel) => onChange({ channel })}
      />
      <FilterMenu
        label="Status"
        value={value.status}
        options={STATUS}
        onChange={(status) => onChange({ status })}
      />
      <FilterMenu
        label="Started by"
        value={value.originator}
        options={ORIGINATOR}
        onChange={(originator) => onChange({ originator })}
      />
      <DateFilter from={value.from} to={value.to} onChange={(range) => onChange(range)} />

      {/* Its own control rather than a menu of two: it is the one filter people
          come to this page already meaning to use. */}
      <button
        type="button"
        aria-pressed={value.followUp}
        onClick={() => onChange({ followUp: !value.followUp })}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
          value.followUp
            ? 'border-danger bg-danger text-white'
            : 'border-line-strong bg-surface text-ink-2 hover:border-danger hover:text-danger',
        )}
      >
        <IconFlag size={11} />
        Needs follow-up
      </button>

      {dirty && (
        <button
          type="button"
          onClick={() => onChange(NO_FILTERS)}
          className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
        >
          <IconX size={11} />
          Clear
        </button>
      )}
    </Card>
  )
}
