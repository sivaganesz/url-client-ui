import { useState } from 'react'
import { useMeasure } from '../../lib/useMeasure'
import { AXIS_TEXT, GRID, SERIES, SERIES_SOFT, Tooltip } from './ChartPrimitives'

const PAD = { top: 12, right: 12, bottom: 26, left: 44 }

/**
 * Single-series line with a crosshair. The y-domain is padded around the data
 * rather than anchored at zero — for a rate hovering near 80% a zero baseline
 * flattens the whole signal into a straight line.
 */
export default function LineChart({
  data,
  formatValue = (v: number) => String(v),
  height = 220,
  label,
  domain,
  maxLabels = 12,
}: {
  data: readonly { label: string; value: number }[]
  formatValue?: (v: number) => string
  height?: number
  label?: string
  domain?: [number, number]
  maxLabels?: number
}) {
  const [ref, { width }] = useMeasure()
  /** Index of the point under the pointer. */
  const [hover, setHover] = useState<number | null>(null)

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = Math.max(0, height - PAD.top - PAD.bottom)

  const values = data.map((d) => d.value)
  const lo = domain?.[0] ?? Math.min(...values) * 0.94
  const hi = domain?.[1] ?? Math.max(...values) * 1.04
  const span = hi - lo || 1

  const px = (i: number) =>
    PAD.left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2)
  const py = (v: number) => PAD.top + plotH - ((v - lo) / span) * plotH

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(d.value)}`).join(' ')
  const area = `${line} L${px(data.length - 1)},${PAD.top + plotH} L${px(0)},${PAD.top + plotH} Z`
  // An index can outlive the data it pointed at when the series reloads
  // under the pointer, so the datum is looked up rather than assumed.
  const hoverDatum = hover === null ? undefined : data[hover]

  const ticks = [lo, lo + span / 2, hi]
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels))

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = e.clientX - rect.left - PAD.left
    const i = Math.max(0, Math.min(data.length - 1, Math.round((rel / plotW) * (data.length - 1))))
    setHover(i)
  }

  return (
    <div ref={ref} className="relative h-full w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label}. ${data.map((d) => `${d.label}: ${formatValue(d.value)}`).join(', ')}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={py(t)} y2={py(t)} stroke={GRID} strokeWidth="1" />
              <text
                x={PAD.left - 8}
                y={py(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="10"
                fill={AXIS_TEXT}
                fontFamily="var(--font-mono)"
              >
                {formatValue(t)}
              </text>
            </g>
          ))}

          <path d={area} fill={SERIES_SOFT} />
          <path d={line} fill="none" stroke={SERIES} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Two months of daily points would overlap into mush, so label
              every nth — plus the last one, when it isn't about to collide
              with the label before it. */}
          {data.map((d, i) =>
            i % labelStep === 0 || (i === data.length - 1 && i % labelStep > labelStep / 2) ? (
              <text key={i} x={px(i)} y={height - 8} textAnchor="middle" fontSize="10.5" fill={AXIS_TEXT}>
                {d.label}
              </text>
            ) : null,
          )}

          {hover !== null && (
            <g pointerEvents="none">
              <line
                x1={px(hover)}
                x2={px(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke={SERIES}
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.5"
              />
              {/* 2px surface ring keeps the marker legible over the line */}
              <circle
                cx={px(hover)}
                cy={py(hoverDatum?.value ?? 0)}
                r="5"
                fill={SERIES}
                stroke="#fff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      )}

      {hover !== null && hoverDatum && (
        <Tooltip
          x={px(hover)}
          y={py(hoverDatum.value)}
          containerWidth={width}
          title={hoverDatum.label}
          value={formatValue(hoverDatum.value)}
        />
      )}
    </div>
  )
}
