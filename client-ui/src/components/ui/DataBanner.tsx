import { cn } from '../../lib/cn'
import { IconAlert } from '../icons'
import Button from './Button'

/**
 * Says why a page has no data.
 *
 * The request failed. Retryable, and the message says what went wrong rather
 * than "something went wrong" — a reader who can see the actual error has some
 * chance of acting on it.
 *
 * It used to carry a second case, for resources the workspace had no endpoint
 * for. Every one of those has an endpoint now, so that case is gone along with
 * the `note` it needed.
 *
 * Renders nothing while loading or once data has arrived.
 */
export default function DataBanner({
  status,
  error,
  onRetry,
  className,
}: {
  status?: string
  error?: Error | null
  onRetry?: () => void
  className?: string
}) {
  if (status !== 'error') return null

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger-bg px-4 py-3',
        className,
      )}
    >
      <IconAlert size={16} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-danger">Couldn’t load this data</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
          {error?.message ?? 'The workspace request failed.'}
        </p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry} className="shrink-0">
          Retry
        </Button>
      )}
    </div>
  )
}
