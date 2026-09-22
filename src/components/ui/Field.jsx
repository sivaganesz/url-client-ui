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

/** Filter pills. `value` is the selected option; options are plain strings. */
export function ChipGroup({ label, options, value, onChange, className }) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const selected = o === value
        return (
          <button
            key={o}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange?.(o)}
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
