import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'

/* Single-series only, so a legend is never needed and identity always comes
   from the axis label. #4f46e5 is the brand indigo and validates as a data
   fill on white, so chrome and charts share one hue rather than drifting. */
const MARK = '#4f46e5'
const GRID = '#e3e3ed'
const AXIS = '#67678a'

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const n = ref.current
    if (!n) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(n)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

const niceMax = (v) => {
  if (!Number.isFinite(v) || v <= 0) return 1
  const base = 10 ** Math.floor(Math.log10(v))
  const n = v / base
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * base
}

/** Bars over time. Hover shows the exact figure. */
export function ActivityChart({ data, height = 190, label }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const pad = { t: 10, r: 6, b: 26, l: 30 }
  const pw = Math.max(0, width - pad.l - pad.r)
  const ph = Math.max(0, height - pad.t - pad.b)
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const slot = data.length ? pw / data.length : 0
  const bw = Math.max(2, slot - 4)

  // Only every other label when space is tight, so they never collide.
  const every = slot < 42 ? Math.ceil(42 / slot) : 1

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label}. ${data.map((d) => `${d.label}: ${d.value}`).join(', ')}`}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((t) => {
            const y = pad.t + ph - t * ph
            return (
              <g key={t}>
                <line x1={pad.l} x2={pad.l + pw} y1={y} y2={y} stroke={GRID} />
                <text x={pad.l - 7} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10.5" fill={AXIS}>
                  {Math.round(t * max)}
                </text>
              </g>
            )
          })}
          {data.map((d, i) => {
            const h = max ? (d.value / max) * ph : 0
            const x = pad.l + i * slot + (slot - bw) / 2
            const y = pad.t + ph - h
            const r = Math.min(3, bw / 2, h)
            return (
              <g key={d.label}>
                <rect
                  x={pad.l + i * slot}
                  y={pad.t}
                  width={slot}
                  height={ph}
                  fill="transparent"
                  onMouseEnter={() => setHover({ i, x: x + bw / 2, y })}
                />
                {h > 0 && (
                  <path
                    d={`M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + bw - r},${y} Q${x + bw},${y} ${x + bw},${y + r} L${x + bw},${y + h} Z`}
                    fill={MARK}
                    opacity={hover && hover.i !== i ? 0.4 : 1}
                    pointerEvents="none"
                  />
                )}
                {i % every === 0 && (
                  <text x={pad.l + i * slot + slot / 2} y={height - 7} textAnchor="middle" fontSize="10" fill={AXIS} pointerEvents="none">
                    {d.label.replace(/ Sept?$/, '')}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-rule bg-card px-2.5 py-1.5 shadow-soft"
          style={{ left: hover.x, top: hover.y, transform: 'translate(-50%, -115%)' }}
        >
          <p className="text-[11px] text-ink-3">{data[hover.i].label}</p>
          <p className="text-[14px] font-semibold tnum">
            {data[hover.i].value} {data[hover.i].value === 1 ? 'conversation' : 'conversations'}
          </p>
        </div>
      )}
    </div>
  )
}

/** Ranked bars with the name and figure printed on every row. */
export function Breakdown({ data, className }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const max = Math.max(...data.map((d) => d.value), 1)
  if (!data.length) return null
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {data.map((d) => (
        <div key={d.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-center gap-2 text-[14px] font-medium">
              {d.icon}
              {d.label}
            </span>
            <span className="shrink-0 text-[13px] text-ink-2 tnum">
              {d.value}
              <span className="ml-1.5 text-ink-3">
                {total ? Math.round((d.value / total) * 100) : 0}%
              </span>
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-sunk">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(d.value / max) * 100}%`, background: MARK }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
