import { useId } from 'react'
import Button from './Button'
import { useDialog } from '../../lib/useDialog'

/**
 * A blocking confirm for changes that reach real customers.
 *
 * Activating or pausing an agent decides whether someone phoning in gets
 * answered, so it isn't something a stray click should be able to do. Escape
 * and the backdrop both cancel; only the button commits.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  tone = 'primary',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title?: React.ReactNode
  body?: React.ReactNode
  confirmLabel?: string
  tone?: 'primary' | 'danger'
  onConfirm?: () => void
  onCancel?: () => void
}) {
  const titleId = useId()
  const panel = useDialog(open, onCancel)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/30"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-sm rounded-card border border-line bg-surface p-5 shadow-raised"
      >
        <h2 id={titleId} className="text-sm font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-2">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant={tone} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
