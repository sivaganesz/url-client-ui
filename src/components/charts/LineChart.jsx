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
  formatValue = (v) => v,
  height = 220,
  label,
  domain,
}) {
  const [ref, { width }] = useMeasure()
  const [hover, setHover] = useState(null)

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = Math.max(0, height - PAD.top - PAD.bottom)

  const values = data.map((d) => d.value)
  const lo = domain?.[0] ?? Math.min(...values) * 0.94
  const hi = domain?.[1] ?? Math.max(...values) * 1.04
  const span = hi - lo || 1

  const px = (i) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2)
  const py = (v) => PAD.top + plotH - ((v - lo) / span) * plotH

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(d.value)}`).join(' ')
  const area = `${line} L${px(data.length - 1)},${PAD.top + plotH} L${px(0)},${PAD.top + plotH} Z`
  const ticks = [lo, lo + span / 2, hi]

  function onMove(e) {
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

          {data.map((d, i) => (
            <text key={d.label} x={px(i)} y={height - 8} textAnchor="middle" fontSize="10.5" fill={AXIS_TEXT}>
              {d.label}
            </text>
          ))}

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
              <circle cx={px(hover)} cy={py(data[hover].value)} r="5" fill={SERIES} stroke="#fff" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}

      {hover !== null && (
        <Tooltip
          x={px(hover)}
          y={py(data[hover].value)}
          containerWidth={width}
          title={data[hover].label}
          value={formatValue(data[hover].value)}
        />
      )}
    </div>
  )
}
