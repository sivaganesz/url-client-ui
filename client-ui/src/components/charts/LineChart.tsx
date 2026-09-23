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

  /**
   * How many x labels the plot can actually hold, not a fixed twelve.
   *
   * "21 Sept" is about 44px at this size, so twelve of them need 550px. On a
   * 360px phone the plot is barely 300px wide and the dates ran into each
   * other — the axis read "17 Ju23 Ju29 Jul4 Aug". Fitting the count to the
   * width thins them out on a phone and leaves the desktop axis as it was.
   */
  const fits = Math.max(2, Math.floor(plotW / 72))
  const labelStep = Math.max(1, Math.ceil(data.length / Math.min(maxLabels, fits)))

  /**
   * The x labels that actually fit, chosen by where they land rather than by
   * a count.
   *
   * Every nth label is only a candidate here. "17 Jul" and "23 Sept" are not
   * the same width, and the last point is always offered whatever the step
   * works out to, so an evenly spaced count still produced collisions — on a
   * 360px phone the axis read "17 Ju23 Ju29 Jul4 Aug", and even the desktop
   * had two dates touching. Each candidate is kept only if it clears the last
   * one it was placed beside.
   *
   * Widths are estimated from the text rather than measured: measuring means
   * rendering first, and an axis that reflows after paint is worse than one
   * that is occasionally a few pixels conservative.
   */
  const estimate = (text: string) => text.length * 5.6 + 6
  const xLabels: { key: number; x: number; anchor: 'start' | 'middle' | 'end'; text: string }[] = []
  let placedTo = -Infinity

  data.forEach((d, i) => {
    if (i % labelStep !== 0 && i !== data.length - 1) return

    const x = px(i)
    const w = estimate(d.label)
    // Centred on its point, except at the ends: the last point sits 12px from
    // the edge, so half of "23 Sept" fell outside the svg and was cut in two.
    const anchor = x - w / 2 < 0 ? 'start' : x + w / 2 > width ? 'end' : 'middle'
    const left = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2

    if (left < placedTo + 8) return
    placedTo = left + w
    xLabels.push({ key: i, x, anchor, text: d.label })
  })

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

          {xLabels.map((l) => (
            <text
              key={l.key}
              x={l.x}
              y={height - 8}
              textAnchor={l.anchor}
              fontSize="10.5"
              fill={AXIS_TEXT}
            >
              {l.text}
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
