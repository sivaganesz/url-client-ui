import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'

/* ── icons ─────────────────────────────────────────────────── */

const S = ({ size = 18, children, ...r }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...r}
  >
    {children}
  </svg>
)

export const IconHome = (p) => (
  <S {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
  </S>
)
export const IconChat = (p) => (
  <S {...p}>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
  </S>
)
export const IconPeople = (p) => (
  <S {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16 11a3 3 0 1 0 0-6M18 20c0-2.6-1-4.4-2.5-5.4" />
  </S>
)
export const IconChannels = (p) => (
  <S {...p}>
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 3v6.5M12 14.5V21M3 12h6.5M14.5 12H21" />
  </S>
)
export const IconSpark = (p) => (
  <S {...p}>
    <path d="M12 3l2.4 5.4L20 11l-5.6 2.6L12 19l-2.4-5.4L4 11l5.6-2.6z" />
  </S>
)
export const IconSearch = (p) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </S>
)
export const IconBack = (p) => (
  <S {...p}>
    <path d="M15 18l-6-6 6-6" />
  </S>
)
export const IconArrow = (p) => (
  <S {...p}>
    <path d="M9 18l6-6-6-6" />
  </S>
)
export const IconGlobe = (p) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
  </S>
)
export const IconPhone = (p) => (
  <S {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </S>
)
export const IconMail = (p) => (
  <S {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M3 7l9 5.5L21 7" />
  </S>
)

export const IconFilter = (p) => (
  <S {...p}>
    <path d="M3 5h18l-7 8v6l-4 2v-8z" />
  </S>
)
export const IconChevron = (p) => (
  <S {...p}>
    <path d="m6 9 6 6 6-6" />
  </S>
)
export const IconTick = (p) => (
  <S {...p}>
    <path d="M20 6 9 17l-5-5" />
  </S>
)
export const IconClose = (p) => (
  <S {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </S>
)

export const channelIcon = {
  Website: IconGlobe,
  WhatsApp: IconChat,
  Phone: IconPhone,
  SMS: IconChat,
  Email: IconMail,
}

/* ── surfaces ──────────────────────────────────────────────── */

export function Card({ className, children, ...r }) {
  return (
    <div className={cn('rounded-card border border-rule bg-card shadow-soft', className)} {...r}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, hint, action }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[17px]">{children}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-ink-3">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

/** A headline number with a plain-English caption under it. */
export function Stat({ label, value, caption, loading }) {
  return (
    <Card className="p-5">
      <p className="text-[12.5px] font-semibold tracking-wide text-ink-3 uppercase">{label}</p>
      {loading ? (
        <div className="mt-2 h-9 w-24 animate-pulse rounded bg-sunk" />
      ) : (
        <p className="mt-1 font-serif text-[36px] leading-none font-semibold tracking-tight tnum">{value}</p>
      )}
      {caption && <p className="mt-2 text-[13px] leading-snug text-ink-3">{caption}</p>}
    </Card>
  )
}

const TONES = {
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-brand-soft text-brand-deep',
  neutral: 'bg-calm-soft text-calm',
}

export function Pill({ tone = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap',
        TONES[tone] ?? TONES.neutral,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function ChannelPill({ channel, className }) {
  const Icon = channelIcon[channel] ?? IconChat
  return (
    <Pill tone="neutral" className={className}>
      <Icon size={12} />
      {channel}
    </Pill>
  )
}

export function initialsOf(name = '') {
  const parts = String(name).trim().split(/s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts.at(-1)[0]).toUpperCase()
}

/** Tinted by name so the same person keeps the same colour down the list. */
const AVATAR_TINTS = [
  'bg-[#ede9fe] text-[#5b21b6]',
  'bg-[#dbeafe] text-[#1e40af]',
  'bg-[#d8f3e6] text-[#046c4e]',
  'bg-[#fdeed3] text-[#9a4b06]',
  'bg-[#fce7f3] text-[#9d174d]',
  'bg-[#e0f2fe] text-[#075985]',
]

export function Avatar({ name, size = 'md', className }) {
  let hash = 0
  for (const ch of String(name ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        size === 'lg' ? 'h-11 w-11 text-[14px]' : 'h-10 w-10 text-[13px]',
        AVATAR_TINTS[hash % AVATAR_TINTS.length],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded bg-sunk', className)} />
}

export function Empty({ title, note, icon: Icon = IconChat }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-sunk text-ink-3">
        <Icon size={22} />
      </span>
      <p className="font-serif text-[17px] font-semibold">{title}</p>
      {note && <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-3">{note}</p>}
    </div>
  )
}

/** Failure is stated plainly — never replaced with made-up numbers. */
export function Problem({ onRetry, className }) {
  return (
    <Card className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <p className="font-serif text-[17px] font-semibold">This didn’t load</p>
      <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-3">
        We couldn’t reach your activity data just now. Nothing is lost — try again in a moment.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-lg border border-rule-strong bg-card px-3.5 py-2 text-[13.5px] font-medium hover:bg-sunk"
        >
          Try again
        </button>
      )}
    </Card>
  )
}

export function SearchBox({ label, value, onChange, placeholder, className }) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <label className="sr-only" htmlFor="q">
        {label}
      </label>
      <IconSearch size={16} className="pointer-events-none absolute left-3.5 text-ink-3" />
      <input
        id="q"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-rule-strong bg-card pr-4 pl-10 text-[14px] placeholder:text-ink-3 focus:border-brand focus:outline-none"
      />
    </div>
  )
}

/**
 * Search and a Filters button on one row; the panel opens inline underneath,
 * full width, pushing the list down. Not a popover — in a narrow pane a
 * floating menu covers the very rows you are filtering.
 *
 * The search input is passed in so both controls share the row.
 * groups: [{ key, label, options, value, onChange }] — "All" means unset.
 */
export function FilterBar({ search, groups, className }) {
  const [open, setOpen] = useState(false)
  const active = groups.filter((g) => g.value !== 'All')

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{search}</div>

        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium transition-colors',
            active.length
              ? 'border-brand bg-brand text-white'
              : 'border-rule-strong bg-card text-ink-2 hover:bg-sunk',
          )}
        >
          <IconFilter size={15} />
          <span>Filters</span>
          {active.length > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white/25 px-1 text-[11px] font-semibold">
              {active.length}
            </span>
          )}
          <IconChevron size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div className="mt-2.5 rounded-xl border border-rule bg-card px-3 pt-3 pb-2.5">
          {groups.map((g) => (
            <div key={g.key} className="mb-3 last:mb-0">
              <p className="mb-1.5 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                {g.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {g.options.map((o) => {
                  const on = o === g.value
                  return (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={on}
                      onClick={() => g.onChange(o)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                        on
                          ? 'border-brand bg-brand font-medium text-white'
                          : 'border-rule-strong bg-card text-ink-2 hover:border-brand-rule hover:bg-brand-soft hover:text-brand-deep',
                      )}
                    >
                      {o}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {active.length > 0 && (
            <div className="flex justify-end border-t border-rule pt-2.5">
              <button
                type="button"
                onClick={() => groups.forEach((g) => g.onChange('All'))}
                className="text-[12px] font-medium text-brand hover:text-brand-deep"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Chips({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={cn(
            'h-9 rounded-full border px-3.5 text-[13px] transition-colors',
            o === value
              ? 'border-brand bg-brand font-medium text-white'
              : 'border-rule-strong bg-card text-ink-2 hover:bg-sunk',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
