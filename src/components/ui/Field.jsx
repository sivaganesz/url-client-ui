import { useId } from 'react'
import { cn } from '../../lib/cn'
import { IconChevronDown, IconSearch } from '../icons'

/** Search box with a real, always-present label (visually hidden by default). */
export function SearchInput({ label, placeholder, value, onChange, className, id }) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <div className={cn('relative flex items-center', className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <IconSearch size={15} className="pointer-events-none absolute left-3 text-ink-4" />
      <input
        id={inputId}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="h-10 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-ink-4 hover:border-ink-4 focus:border-brand focus:outline-none"
      />
    </div>
  )
}

/**
 * Native select — keyboard and screen-reader behaviour for free.
 *
 * Filter bars read better when the closed select carries its own subject
 * ("Channel: Phone"), so options are prefixed with the label by default. Set
 * `prefixLabel={false}` where the options already say what they are.
 */
export function Select({
  label,
  value,
  onChange,
  options,
  size = 'md',
  prefixLabel = true,
  className,
  id,
}) {
  const generated = useId()
  const selectId = id ?? generated
  const small = size === 'sm'
  return (
    <div className={cn('relative flex items-center', className)}>
      <label htmlFor={selectId} className="sr-only">
        {label}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          'appearance-none rounded-lg border border-line-strong bg-surface py-0 text-ink transition-colors hover:border-ink-4 focus:border-brand focus:outline-none',
          small ? 'h-8 pr-7 pl-2.5 text-[11.5px]' : 'h-10 pr-8 pl-3 text-[13px]',
        )}
      >
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value
          const text = typeof o === 'string' ? o : o.label
          return (
            <option key={val} value={val}>
              {prefixLabel ? `${label}: ${text}` : text}
            </option>
          )
        })}
      </select>
      <IconChevronDown
        size={small ? 12 : 13}
        className={cn('pointer-events-none absolute text-ink-3', small ? 'right-2' : 'right-2.5')}
      />
    </div>
  )
}

/**
 * Filter pills. `value` is the selected option; options are plain strings.
 *
 * With `multiple`, `value` is an array and each pill toggles. An empty array
 * means no restriction — the same as picking every pill, but it says "I don't
 * care about this" rather than making the reader check all five are lit.
 */
export function ChipGroup({ label, options, value, onChange, multiple = false, wrap = true, className }) {
  const isOn = (o) => (multiple ? value.includes(o) : o === value)
  const pick = (o) => {
    if (!multiple) return onChange?.(o)
    onChange?.(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex gap-1.5', wrap ? 'flex-wrap' : 'flex-nowrap', className)}
    >
      {options.map((o) => {
        const selected = isOn(o)
        return (
          <button
            key={o}
            type="button"
            aria-pressed={selected}
            onClick={() => pick(o)}
            className={cn(
              'h-7 rounded-full border px-2.5 text-[11.5px] transition-colors',
              selected
                ? 'border-brand bg-brand font-medium text-white'
                : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken',
            )}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

/**
 * From / to date range.
 *
 * Native date inputs, so the calendar, keyboard entry and the locale's own
 * format come free — and the value is always a real `yyyy-mm-dd`, never a
 * string someone typed in the wrong order.
 */
export function DateRange({ from, to, onFrom, onTo, className }) {
  const fromId = useId()
  const toId = useId()
  const field =
    'h-8 rounded-lg border border-line-strong bg-surface px-2 text-[11.5px] text-ink transition-colors hover:border-ink-4 focus:border-brand focus:outline-none'

  return (
    <div className={cn('flex items-center gap-2 text-[11.5px] text-ink-3', className)}>
      <label htmlFor={fromId}>From</label>
      <input
        id={fromId}
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onFrom?.(e.target.value)}
        className={field}
      />
      <label htmlFor={toId}>to</label>
      <input
        id={toId}
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onTo?.(e.target.value)}
        className={field}
      />
    </div>
  )
}

/** Shared look for the controls inside a FormField. */
export const controlClass =
  'w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink transition-colors placeholder:text-ink-4 hover:border-ink-4 focus:border-brand focus:outline-none disabled:bg-sunken disabled:text-ink-4'

/**
 * A labelled control in a form, with an optional hint underneath.
 *
 * `children` is a function taking the generated id, so the label stays tied to
 * whatever control the caller renders — input, select or textarea — without
 * this component having to know which.
 */
export function FormField({ label, hint, hintTone = 'muted', children, className }) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[10.5px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
        {label}
      </label>
      {children(id)}
      {hint && (
        <p className={cn('text-[11px] leading-relaxed', hintTone === 'warn' ? 'text-warn' : 'text-ink-3')}>
          {hint}
        </p>
      )}
    </div>
  )
}

/** Underlined tab bar used inside a detail pane. */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex items-stretch gap-6', className)} role="tablist">
      {tabs.map((t) => {
        const selected = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange?.(t.id)}
            className={cn(
              '-mb-px border-b-2 pb-2.5 text-[13px] transition-colors',
              selected
                ? 'border-brand font-semibold text-brand'
                : 'border-transparent font-medium text-ink-3 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
