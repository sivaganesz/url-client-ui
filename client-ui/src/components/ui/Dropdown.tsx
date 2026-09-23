import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

/**
 * A button that opens a menu beneath it. Escape and a click outside close it.
 *
 * Both slots are render props: `button` receives `{ open, toggle }` so the
 * trigger can look like whatever its surroundings need, and `children`
 * receives `{ close }` so an item can dismiss the menu after acting.
 *
 * The menu is nudged back on screen if the button it hangs from sits too near
 * an edge for it — which on a phone is most of them, since a 256px menu under
 * a button two thirds of the way across a 390px screen hangs half of itself
 * past the edge.
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
  const menu = useRef<HTMLDivElement>(null)

  /**
   * Written straight to the node rather than held in state: it is a correction
   * to a layout that has already happened, so a re-render would only be a
   * second pass at the same answer — and this has to land before the browser
   * paints, or the menu is visibly seen to jump.
   */
  useLayoutEffect(() => {
    const el = menu.current
    if (!open || !el) return

    const gutter = 8
    el.style.transform = ''
    const rect = el.getBoundingClientRect()

    let dx = 0
    if (rect.right > window.innerWidth - gutter) dx = window.innerWidth - gutter - rect.right
    if (rect.left + dx < gutter) dx = gutter - rect.left
    el.style.transform = dx ? `translateX(${dx}px)` : ''
  }, [open])

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
          ref={menu}
          role="menu"
          className={cn(
            'absolute z-30 mt-1 max-w-[calc(100vw-1rem)] min-w-full overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-raised',
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
