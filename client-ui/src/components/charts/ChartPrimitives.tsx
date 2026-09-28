import { cn } from '../../lib/cn'

/**
 * Shared chart parameters.
 *
 * SERIES is the data-mark hue, deliberately not the UI brand blue (#3a5a8c):
 * the brand step is too desaturated to read as a data fill — it validates as
 * gray. #2a78d6 is the validated slot-1 blue and passes lightness, chroma and
 * 3:1 contrast on a white surface.
 *
 * Every chart here is single-series, so no categorical palette is in play and
 * identity is carried by axis labels, never by colour alone.
 */
export const SERIES = '#2a78d6'
export const SERIES_SOFT = 'rgba(42, 120, 214, 0.12)'
export const GRID = '#ece9e2'
export const AXIS_TEXT = '#6b6862'

/** Rounded only on the end away from the baseline, per mark spec. */
export function barPathVertical(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, w / 2, h)
  if (h <= 0) return ''
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

export function barPathHorizontal(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, h / 2, w)
  if (w <= 0) return ''
  return `M${x},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} L${x},${y + h} Z`
}

/** Floating tooltip. Positioned by the caller in container coordinates. */
export function Tooltip({
  x,
  y,
  title,
  value,
  containerWidth,
}: {
  x: number
  y: number
  title?: React.ReactNode
  value?: React.ReactNode
  containerWidth: number
}) {
  // Flip to the left of the cursor when close to the right edge.
  const flip = containerWidth > 0 && x > containerWidth - 120
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-raised"
      style={{
        left: x,
        top: y,
        transform: `translate(${flip ? 'calc(-100% - 10px)' : '10px'}, -50%)`,
      }}
    >
      <div className="text-[10px] font-semibold tracking-wide text-ink-3 uppercase">{title}</div>
      <div className="font-mono text-[13px] font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export function ChartFrame({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col rounded-card border border-line bg-surface shadow-card',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-1">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="min-h-0 flex-1 px-3 pt-2 pb-3">{children}</div>
    </section>
  )
}
