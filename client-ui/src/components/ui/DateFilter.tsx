import Dropdown, { MenuItem } from './Dropdown'
import { DateInput } from './Field'
import { IconCalendar, IconCheck, IconChevronDown } from '../icons'
import { cn } from '../../lib/cn'

/** Local `yyyy-mm-dd`. Going through toISOString() would shift the day east of UTC. */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const short = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * The ranges people actually ask for, worked out fresh each time the menu
 * opens — a range computed once at module load says "today" about the day the
 * tab was opened, which is wrong for a console left running overnight.
 */
function presets() {
  const now = new Date()
  const today = ymd(now)
  const back = (days: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (days - 1))
    return ymd(d)
  }
  return [
    { label: 'Any time', from: '', to: '' },
    { label: 'Today', from: today, to: today },
    { label: 'Last 7 days', from: back(7), to: today },
    { label: 'Last 30 days', from: back(30), to: today },
    { label: 'This month', from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today },
  ]
}

/**
 * A date range as one control: the common ranges by name, and the two date
 * inputs underneath for anything else.
 *
 * "From [dd-mm-yyyy] to [dd-mm-yyyy]" asks for two decisions and a calendar
 * click before it can answer "what came in this week", which is most of what
 * anyone wants from it. The inputs are still there, one level down, for the
 * range that has to be exact.
 */
export default function DateFilter({
  from,
  to,
  onChange,
  className,
}: {
  from: string
  to: string
  onChange?: (range: { from: string; to: string }) => void
  className?: string
}) {
  const ranges = presets()

  const named = ranges.find((p) => p.from === from && p.to === to)
  const label = named
    ? named.label
    : from && to
      ? `${short(from)} – ${short(to)}`
      : from
        ? `From ${short(from)}`
        : `Until ${short(to)}`

  const active = Boolean(from || to)

  return (
    <Dropdown
      align="left"
      menuClassName="w-64 py-0"
      button={({ open, toggle }) => (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
          className={cn(
            'inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-[11.5px] transition-colors',
            active
              ? 'border-brand-line bg-brand-soft text-brand-dark'
              : 'border-line-strong bg-surface text-ink-2 hover:border-ink-4 hover:text-ink',
            open && 'border-brand',
            className,
          )}
        >
          <IconCalendar size={12} className={cn('shrink-0', active ? 'text-brand-dark/60' : 'text-ink-3')} />
          <span className="truncate font-semibold">{label}</span>
          <IconChevronDown size={11} className={cn('shrink-0', active ? 'text-brand-dark/60' : 'text-ink-4')} />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="py-1">
            {ranges.map((p) => (
              <MenuItem
                key={p.label}
                selected={named?.label === p.label}
                onClick={() => {
                  onChange?.({ from: p.from, to: p.to })
                  close()
                }}
              >
                <span className="flex-1">{p.label}</span>
                {named?.label === p.label && <IconCheck size={11} className="shrink-0" />}
              </MenuItem>
            ))}
          </div>

          {/* Left open while these are edited — picking a day is not a choice
              that should dismiss the half-entered range beside it.

              Stacked, not side by side: a native date input will not go below
              about 130px, and two of them with a "to" between overflow any
              menu narrow enough to sit under the button that opened it. */}
          <div className="flex flex-col gap-1.5 border-t border-line bg-sunken px-3 py-2.5">
            <span className="text-[10px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
              Custom range
            </span>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="w-8 shrink-0 text-[11px] text-ink-3">
                From
              </span>
              <DateInput
                label="From date"
                value={from}
                max={to || undefined}
                onChange={(value) => onChange?.({ from: value, to })}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="w-8 shrink-0 text-[11px] text-ink-3">
                To
              </span>
              <DateInput
                label="To date"
                value={to}
                min={from || undefined}
                onChange={(value) => onChange?.({ from, to: value })}
                className="flex-1"
              />
            </div>
          </div>
        </>
      )}
    </Dropdown>
  )
}
