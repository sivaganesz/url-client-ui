import { cn } from '../../lib/cn'

/**
 * `tone` colours the icon chip and the footnote — for a figure that is itself
 * the warning, like a balance about to run out. The number stays black: a
 * coloured headline reads as an error rather than a reading.
 */
const TONES: Record<string, { chip: string; foot: string }> = {
  warn: { chip: 'bg-warn-bg text-warn', foot: 'text-warn' },
  danger: { chip: 'bg-danger-bg text-danger', foot: 'text-danger' },
}

/**
 * One headline number. `loading` renders the same box at the same height so
 * the grid never reflows when live data arrives.
 */
export default function StatTile({
  label,
  value,
  foot,
  icon: Icon,
  tone,
  loading = false,
  className,
}: {
  label?: React.ReactNode
  value?: React.ReactNode
  foot?: React.ReactNode
  icon?: React.ComponentType<{ size?: number; className?: string }>
  tone?: 'warn' | 'danger'
  loading?: boolean
  className?: string
}) {
  const toned = tone ? TONES[tone] : undefined
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
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              toned?.chip ?? 'bg-muted-bg text-ink-3',
            )}
          >
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
        foot && (
          <div className={cn('truncate text-[11.5px]', toned?.foot ?? 'text-ink-3')}>{foot}</div>
        )
      )}
    </div>
  )
}

export function StatGrid({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-4', className)}>{children}</div>
}
