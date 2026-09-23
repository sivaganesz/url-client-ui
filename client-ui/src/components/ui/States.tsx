import { cn } from '../../lib/cn'
import { IconAlert, IconRefresh } from '../icons'
import Button from './Button'

export function Skeleton({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded bg-muted-bg', className)} {...rest} />
}

/**
 * Stands in while a lazily-loaded route arrives — a few milliseconds, and only
 * the first visit to that route. Shaped like a page rather than a spinner, so
 * the layout doesn't jump when the real one renders.
 */
export function PageSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 p-5 sm:p-6" aria-busy="true">
      <span className="sr-only">Loading page…</span>
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-card" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-card" />
    </div>
  )
}

export interface StateProps {
  icon?: React.ComponentType<{ size?: number; className?: string }>
  title?: React.ReactNode
  note?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, note, action, className }: StateProps) {
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
export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error?: Error | string | null
  onRetry?: () => void
  className?: string
}) {
  const message = (typeof error === 'object' && error?.message) || String(error ?? 'Unknown error')
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
