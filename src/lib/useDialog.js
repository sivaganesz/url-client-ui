import { useEffect, useRef } from 'react'

/** Everything focusable, minus anything deliberately taken out of the order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The four things an open dialog owes a keyboard user.
 *
 * Returns a ref to put on the dialog panel. While it is open:
 *
 *   · focus moves inside, so the next Tab lands in the dialog rather than
 *     somewhere behind it
 *   · Tab and Shift+Tab cycle within it, so focus cannot wander onto the page
 *     underneath, where a sighted mouse user would see it disappear
 *   · Escape closes it
 *   · focus returns to whatever opened it, so a keyboard user carries on from
 *     where they were rather than at the top of the document
 *
 * The page behind is also locked from scrolling, which is what stops a
 * trackpad from moving the background while a dialog sits on top of it.
 */
export function useDialog(open, onClose) {
  const panel = useRef(null)
  const restoreTo = useRef(null)

  useEffect(() => {
    if (!open) return

    restoreTo.current = document.activeElement
    const node = panel.current

    // The panel itself, not its first button: it carries the dialog's
    // accessible name, so a screen reader announces what just opened before
    // the user tabs into it. Panels take tabIndex={-1} for this.
    node?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !node) return

      const items = [...node.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) return

      const edge = e.shiftKey ? items[0] : items.at(-1)
      // Only intervene at the ends; in between, the browser does it better.
      if (document.activeElement === edge) {
        e.preventDefault()
        ;(e.shiftKey ? items.at(-1) : items[0]).focus()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      // Only if it is still in the document — the element that opened the
      // dialog may itself have been removed by whatever the dialog did.
      const back = restoreTo.current
      if (back && document.contains(back)) back.focus()
    }
  }, [open, onClose])

  return panel
}
