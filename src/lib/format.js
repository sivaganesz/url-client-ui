const nf = new Intl.NumberFormat('en-IN')

/** 12480 -> "12,480" */
export function num(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return nf.format(value)
}

/** 0.824 -> "82.4%" */
export function pct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

/** 1_840_000 -> "1.84M". Token counts get long fast; the tile has one line. */
export function compact(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(value)
}

/** Nullish table cells render as an em dash rather than an empty box. */
export function dash(value) {
  return value === null || value === undefined || value === '' ? '—' : value
}
