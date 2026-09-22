import { useEffect, useRef } from 'react'
import Button from './Button'

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
}) {
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onCancel?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-sm rounded-card border border-line bg-surface p-5 shadow-raised"
      >
        <h2 id="confirm-title" className="text-sm font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-2">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button ref={confirmRef} size="sm" variant={tone} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
