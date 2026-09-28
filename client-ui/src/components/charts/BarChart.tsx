import { useState } from 'react'
import { useMeasure, niceMax } from '../../lib/useMeasure'
import { AXIS_TEXT, GRID, SERIES, Tooltip, barPathVertical } from './ChartPrimitives'

const PAD = { top: 12, right: 8, bottom: 26, left: 40 }
const GAP = 2 // surface gap between adjacent bars, per mark spec

/**
 * Single-series vertical bars. Magnitude over an ordered category (days).
 * One series, so the title names it and no legend box is needed.
 */
export default function BarChart({
  data,
  formatValue = (v: number) => String(v),
  height = 220,
  label,
}: {
  data: readonly { label: string; value: number }[]
  formatValue?: (v: number) => string
  height?: number
  label?: string
}) {
  const [ref, { width }] = useMeasure()
  /** Which bar the pointer is over, plus where to anchor its tooltip. */
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null)

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = Math.max(0, height - PAD.top - PAD.bottom)
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const slot = data.length > 0 ? plotW / data.length : 0
  const barW = Math.max(0, slot - GAP * 2)
  // An index can outlive the data it pointed at when the series reloads
  // under the pointer, so the datum is looked up rather than assumed.
  const hoverDatum = hover ? data[hover.i] : undefined

  const ticks = [0, 0.5, 1].map((t) => t * max)

  return (
    <div ref={ref} className="relative h-full w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label}. ${data.map((d) => `${d.label}: ${formatValue(d.value)}`).join(', ')}`}
          onMouseLeave={() => setHover(null)}
        >
          {/* recessive gridlines + value axis */}
          {ticks.map((t) => {
            const y = PAD.top + plotH - (t / max) * plotH
            return (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y} y2={y} stroke={GRID} strokeWidth="1" />
                <text
                  x={PAD.left - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="10"
                  fill={AXIS_TEXT}
                  fontFamily="var(--font-mono)"
                >
                  {formatValue(t)}
                </text>
              </g>
            )
          })}

          {data.map((d, i) => {
            const h = max > 0 ? (d.value / max) * plotH : 0
            const x = PAD.left + i * slot + GAP
            const y = PAD.top + plotH - h
            const active = hover?.i === i
            return (
              <g key={d.label}>
                {/* hit target spans the full slot height, not just the bar */}
                <rect
                  x={PAD.left + i * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover({ i, x: x + barW / 2, y: y })}
                />
                <path
                  d={barPathVertical(x, y, barW, h)}
                  fill={SERIES}
                  opacity={hover && !active ? 0.45 : 1}
                  className="transition-opacity"
                  pointerEvents="none"
                />
                <text
                  x={x + barW / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="10.5"
                  fill={AXIS_TEXT}
                  pointerEvents="none"
                >
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>
      )}

      {hoverDatum && hover && (
        <Tooltip
          x={hover.x}
          y={hover.y}
          containerWidth={width}
          title={hoverDatum.label}
          value={formatValue(hoverDatum.value)}
        />
      )}
    </div>
  )
}
