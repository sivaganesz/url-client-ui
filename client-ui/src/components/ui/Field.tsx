import { useId } from 'react'
import { cn } from '../../lib/cn'
import { IconChevronDown, IconSearch } from '../icons'

/** Search box with a real, always-present label (visually hidden by default). */
export function SearchInput({
  label,
  placeholder,
  value,
  onChange,
  className,
  id,
}: {
  label: string
  placeholder?: string
  value: string
  onChange?: (value: string) => void
  className?: string
  id?: string
}) {
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
export type SelectOption = string | { value: string; label: string }

export function Select({
  label,
  value,
  onChange,
  options,
  size = 'md',
  prefixLabel = true,
  className,
  id,
}: {
  label: string
  value: string
  onChange?: (value: string) => void
  options: readonly SelectOption[]
  size?: 'sm' | 'md'
  prefixLabel?: boolean
  className?: string
  id?: string
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
export function ChipGroup({
  label,
  options,
  value,
  onChange,
  multiple = false,
  wrap = true,
  className,
}: {
  label: string
  options: readonly string[]
  /** A string when single-select, an array when `multiple`. */
  value: string | string[]
  onChange?: (next: never) => void
  multiple?: boolean
  wrap?: boolean
  className?: string
}) {
  const isOn = (o: string) => (multiple ? (value as string[]).includes(o) : o === value)
  const pick = (o: string) => {
    if (!multiple) return onChange?.(o as never)
    const list = value as string[]
    onChange?.((list.includes(o) ? list.filter((v) => v !== o) : [...list, o]) as never)
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
 * A native date input that says what it wants while it is empty.
 *
 * An empty `input[type=date]` draws its own "dd-mm-yyyy", but only on desktop
 * Chromium and Firefox. On iOS Safari and in Android web views the field is
 * simply blank until it is tapped, so it reads as broken — or as a text box
 * nobody filled in — on exactly the screens where there is least room to guess
 * from.
 *
 * So the hint is drawn here instead, and the native editor is held transparent
 * while the field is empty, which keeps the two from showing at once on the
 * browsers that do provide one.
 *
 * Focus hands the field back only where the pointer is fine. A desktop puts
 * you in its "dd-mm-yyyy" segments to type into, which have to be visible; a
 * phone opens a calendar dialog and draws nothing in the field itself, so
 * handing over there blanks it the moment it is tapped.
 */
export function DateInput({
  value,
  onChange,
  label,
  min,
  max,
  size = 'md',
  id,
  className,
}: {
  value: string
  onChange?: (value: string) => void
  /** Visually hidden unless the caller renders its own. */
  label: string
  min?: string
  max?: string
  size?: 'sm' | 'md'
  id?: string
  className?: string
}) {
  const generated = useId()
  const inputId = id ?? generated
  const small = size === 'sm'

  return (
    // Clipped: the hint below is positioned, not laid out, so a field squeezed
    // narrower than its own text would otherwise spill "DD/MM/YYYY" across
    // whatever sits beside it.
    <div className={cn('relative flex items-center overflow-hidden', className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        id={inputId}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          'peer w-full rounded-lg border border-line-strong bg-surface text-ink transition-colors hover:border-ink-4 focus:border-brand focus:outline-none',
          small ? 'h-7 px-1.5 text-[10.5px]' : 'h-8 px-2 text-[11.5px]',
          /**
           * Handed back on focus only where a pointer is fine.
           *
           * On a desktop, focusing an empty date field puts you in its
           * "dd-mm-yyyy" segments and you type into them, so the real editor
           * has to be visible or you cannot see what you are typing. On a
           * phone, focus opens a calendar dialog and the field itself renders
           * nothing at all — hand over there and it goes blank the moment it
           * is tapped, which is what it used to do.
           */
          !value && 'text-transparent [@media(pointer:fine)]:focus:text-ink',
        )}
      />
      {!value && (
        <span
          aria-hidden="true"
          className={cn(
            // Stays up on a phone even while the calendar is open, since
            // nothing else is drawn in the field until a day is picked.
            'pointer-events-none absolute text-ink-4 [@media(pointer:fine)]:peer-focus:hidden',
            small ? 'left-1.5 text-[10.5px]' : 'left-2 text-[11.5px]',
          )}
        >
          DD/MM/YYYY
        </span>
      )}
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
export function DateRange({
  from,
  to,
  onFrom,
  onTo,
  className,
}: {
  from: string
  to: string
  onFrom?: (value: string) => void
  onTo?: (value: string) => void
  className?: string
}) {
  /**
   * Its own row on a phone, sharing a line with the chips above that width.
   *
   * A native date input has an intrinsic width it will not go under, so on a
   * narrow screen the pair cannot squeeze onto a shared line: they were being
   * compressed until the second one ran off the card and "to" sat on top of
   * the first. Given the row to themselves they fit at 320px with room over.
   *
   * The words are decoration; each input carries its own label for a screen
   * reader.
   */
  return (
    <div
      className={cn(
        'flex w-full flex-wrap items-center gap-1.5 text-[10.5px] text-ink-3 sm:w-auto',
        className,
      )}
    >
      <span aria-hidden="true">From</span>
      <DateInput
        label="From date"
        size="sm"
        value={from}
        max={to || undefined}
        onChange={onFrom}
        className="min-w-[96px] flex-1 sm:max-w-[124px] sm:flex-none"
      />
      <span aria-hidden="true">to</span>
      <DateInput
        label="To date"
        size="sm"
        value={to}
        min={from || undefined}
        onChange={onTo}
        className="min-w-[96px] flex-1 sm:max-w-[124px] sm:flex-none"
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
export function FormField({
  label,
  hint,
  hintTone = 'muted',
  children,
  className,
}: {
  label: React.ReactNode
  hint?: React.ReactNode
  hintTone?: 'muted' | 'warn'
  /** Takes the generated id, so the label binds to whatever control is rendered. */
  children: (id: string) => React.ReactNode
  className?: string
}) {
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
export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: readonly { id: string; label: React.ReactNode }[]
  value: string
  onChange?: (id: string) => void
  className?: string
}) {
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
