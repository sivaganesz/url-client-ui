import { useId } from 'react'
import { IconX } from '../icons'
import { cn } from '../../lib/cn'
import { useDialog } from '../../lib/useDialog'

/**
 * A centred dialog with a title bar, a scrolling body and a footer.
 *
 * Escape and the backdrop both close it, and focus moves inside on open so a
 * keyboard doesn't stay behind the overlay. `ConfirmDialog` stays separate:
 * it is an alertdialog asking one question, not a form.
 */
export default function Modal({ open, title, onClose, footer, children, className }) {
  const titleId = useId()
  const panel = useDialog(open, onClose)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/30" />

      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-card border border-line bg-surface shadow-raised outline-none',
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-4 pb-3">
          <h2 id={titleId} className="text-[15px] font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mt-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-muted-bg hover:text-ink"
          >
            <IconX size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">{children}</div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-sunken px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
