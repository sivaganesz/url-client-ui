import { cn } from '../../lib/cn'
import { IconAlert, IconRefresh } from '../icons'
import Button from './Button'

/**
 * Says where the numbers on this page came from.
 *
 * A console that silently swaps sample data for live data is worse than one
 * that shows nothing, so every page that can fall back says so in place.
 */
export default function DataBanner({ status, error, note, onRetry, className }) {
  if (status === 'live' || status === 'loading') return null

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
          {isError ? 'Live data failed — showing sample data' : 'Sample data'}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-2">
          {isError ? (error?.message ?? 'The workspace request failed.') : note}
        </p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry} className="shrink-0">
          <IconRefresh size={13} />
          Retry
        </Button>
      )}
    </div>
  )
}
