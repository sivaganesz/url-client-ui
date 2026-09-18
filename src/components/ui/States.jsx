import { cn } from '../../lib/cn'
import { IconAlert, IconRefresh } from '../icons'
import Button from './Button'

export function Skeleton({ className, ...rest }) {
  return <div className={cn('animate-pulse rounded bg-muted-bg', className)} {...rest} />
}

export function EmptyState({ icon: Icon, title, note, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-14 text-center', className)}>
      {Icon && (
        <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-muted-bg text-ink-4">
          <Icon size={20} />
        </span>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {note && <p className="max-w-sm text-xs leading-relaxed text-ink-3">{note}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/**
 * Shown when a fetch fails. Surfaces the real message rather than a generic
 * "something went wrong" — a 401 and a dropped connection need different fixes.
 */
export function ErrorState({ error, onRetry, className }) {
  const message = error?.message ?? String(error ?? 'Unknown error')
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-14 text-center', className)}>
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-danger-bg text-danger">
        <IconAlert size={20} />
      </span>
      <p className="text-sm font-semibold text-ink">Couldn’t load this</p>
      <p className="max-w-md font-mono text-xs leading-relaxed break-words text-ink-3">{message}</p>
      {onRetry && (
        <Button size="sm" className="mt-2" onClick={onRetry}>
          <IconRefresh size={14} />
          Retry
        </Button>
      )}
    </div>
  )
}
