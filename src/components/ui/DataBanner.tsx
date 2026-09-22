import { cn } from '../../lib/cn'
import { IconAlert } from '../icons'
import Button from './Button'

/**
 * Says why a page has no data.
 *
 * Two different things, kept apart because they need different responses:
 *   · error       — the request failed. Retryable, and the message says what
 *                   went wrong rather than "something went wrong".
 *   · unavailable — the workspace has no endpoint for this yet. Nothing to
 *                   retry, so no button; the note explains what is missing.
 *
 * Renders nothing while loading or once data has arrived.
 */
export default function DataBanner({
  status,
  error,
  note,
  onRetry,
  className,
}: {
  status?: string
  error?: Error | null
  note?: React.ReactNode
  onRetry?: () => void
  className?: string
}) {
  if (status !== 'error' && status !== 'unavailable') return null

  const isError = status === 'error'

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-card border px-4 py-3',
        isError ? 'border-danger/25 bg-danger-bg' : 'border-warn/25 bg-warn-bg',
        className,
      )}
    >
      <IconAlert size={16} className={cn('mt-0.5 shrink-0', isError ? 'text-danger' : 'text-warn')} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-semibold', isError ? 'text-danger' : 'text-warn')}>
          {isError ? 'Couldn’t load this data' : 'Not available yet'}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
          {isError ? (error?.message ?? 'The workspace request failed.') : note}
        </p>
      </div>
      {isError && onRetry && (
        <Button size="sm" onClick={onRetry} className="shrink-0">
          Retry
        </Button>
      )}
    </div>
  )
}
