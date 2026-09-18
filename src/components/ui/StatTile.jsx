import { cn } from '../../lib/cn'

/**
 * One headline number. `loading` renders the same box at the same height so
 * the grid never reflows when live data arrives.
 */
export default function StatTile({ label, value, foot, icon: Icon, loading = false, className }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10.5px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
          {label}
        </span>
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted-bg text-ink-3">
            <Icon size={15} />
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-7 w-24 animate-pulse rounded bg-muted-bg" />
      ) : (
        <div className="font-mono text-[28px] leading-none font-semibold tracking-tight tabular-nums">
          {value}
        </div>
      )}

      {loading ? (
        <div className="h-3.5 w-32 animate-pulse rounded bg-muted-bg" />
      ) : (
        foot && <div className="truncate text-[11.5px] text-ink-3">{foot}</div>
      )}
    </div>
  )
}

export function StatGrid({ children, className }) {
  return <div className={cn('grid gap-4', className)}>{children}</div>
}
