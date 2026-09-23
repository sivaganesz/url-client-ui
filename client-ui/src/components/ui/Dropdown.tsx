import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

/**
 * A button that opens a menu beneath it. Escape and a click outside close it.
 *
 * Both slots are render props: `button` receives `{ open, toggle }` so the
 * trigger can look like whatever its surroundings need, and `children`
 * receives `{ close }` so an item can dismiss the menu after acting.
 */
export default function Dropdown({
  button,
  children,
  align = 'right',
  menuClassName,
}: {
  button: (api: { open: boolean; toggle: () => void }) => React.ReactNode
  children: (api: { close: () => void }) => React.ReactNode
  align?: 'left' | 'right'
  menuClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      {button({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 mt-1 min-w-full overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-raised',
            align === 'right' ? 'right-0' : 'left-0',
            menuClassName,
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  )
}

/** One row in a Dropdown menu. `selected` marks the current choice. */
export function MenuItem({
  onClick,
  selected = false,
  children,
  className,
}: {
  onClick?: () => void
  selected?: boolean
  children?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] transition-colors',
        selected ? 'bg-brand-soft font-medium text-brand-dark' : 'text-ink-2 hover:bg-sunken hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}
