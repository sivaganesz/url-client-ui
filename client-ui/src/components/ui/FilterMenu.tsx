import Dropdown, { MenuItem } from './Dropdown'
import { IconCheck, IconChevronDown } from '../icons'
import { cn } from '../../lib/cn'

export interface FilterOption {
  value: string
  label: string
  icon?: React.ComponentType<{ size?: number; className?: string }>
}

/**
 * One filter, as a button that says what it is and what it is set to.
 *
 * A row of bare pills — All, active, ended, resolved — makes the reader work
 * out what the row is even about, and three such rows make them work out where
 * one ends and the next begins. This carries its own subject ("Status Ended"),
 * so a filter bar reads as a sentence whatever order it wraps in, and takes one
 * line instead of six.
 *
 * Tinted when it is holding something back, so a filtered table never looks
 * like an empty one.
 */
export default function FilterMenu({
  label,
  value,
  options,
  onChange,
  defaultValue,
  className,
}: {
  label: string
  value: string
  options: readonly FilterOption[]
  onChange?: (value: string) => void
  /** The value that counts as "not filtering"; the first option by default. */
  defaultValue?: string
  className?: string
}) {
  const current = options.find((o) => o.value === value) ?? options[0]
  const active = value !== (defaultValue ?? options[0]?.value)
  const Icon = current?.icon

  return (
    <Dropdown
      align="left"
      menuClassName="w-44"
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
          <span className={cn('shrink-0', active ? 'text-brand-dark/60' : 'text-ink-3')}>{label}</span>
          {Icon && <Icon size={11} className="shrink-0" />}
          <span className="truncate font-semibold">{current?.label}</span>
          <IconChevronDown size={11} className={cn('shrink-0', active ? 'text-brand-dark/60' : 'text-ink-4')} />
        </button>
      )}
    >
      {({ close }) =>
        options.map((o) => {
          const OptionIcon = o.icon
          return (
            <MenuItem
              key={o.value}
              selected={o.value === value}
              onClick={() => {
                onChange?.(o.value)
                close()
              }}
            >
              {OptionIcon && <OptionIcon size={11} className="shrink-0" />}
              <span className="flex-1 truncate">{o.label}</span>
              {o.value === value && <IconCheck size={11} className="shrink-0" />}
            </MenuItem>
          )
        })
      }
    </Dropdown>
  )
}
