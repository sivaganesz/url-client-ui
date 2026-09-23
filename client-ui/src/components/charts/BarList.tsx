import { SERIES } from './ChartPrimitives'

/**
 * Ranked horizontal bars. Each row is named and its value printed, so position
 * and text carry identity — one hue is correct here, and a categorical palette
 * would be adding colour that encodes nothing.
 */
export default function BarList({
  data,
  formatValue = (v: number) => String(v),
  label,
}: {
  data: readonly { label: string; value: number }[]
  formatValue?: (v: number) => string
  label?: string
}) {
  const max = Math.max(...data.map((d) => d.value), 0) || 1
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="flex flex-col gap-3" role="group" aria-label={label}>
      {data.map((d) => {
        const share = total > 0 ? d.value / total : 0
        return (
          <div key={d.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-xs font-medium text-ink">{d.label}</span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-ink-2">
                {formatValue(d.value)}
                <span className="ml-1.5 text-ink-4">{(share * 100).toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted-bg">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${(d.value / max) * 100}%`, backgroundColor: SERIES }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
