const nf = new Intl.NumberFormat('en-IN')

/** 12480 -> "12,480" */
export function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return nf.format(value)
}

/** 0.824 -> "82.4%" */
export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

/** 1_840_000 -> "1.84M". Token counts get long fast; the tile has one line. */
export function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(value)
}

/** Nullish table cells render as an em dash rather than an empty box. */
export function dash<T>(value: T): T | string {
  return value === null || value === undefined || value === '' ? '—' : value
}

/** 1703.585 -> "1,703.59". A balance is money-shaped: always two decimals. */
export function credits(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Seconds to a player clock: 147 -> "2:27".
 *
 * Padded so a running counter doesn't change width every tick. Distinct from
 * `spoken()` in api.js, which writes a duration out longhand ("2m 27s") for
 * reading rather than for watching.
 */
export function clock(seconds: number | null | undefined): string {
  const t = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/** A timestamp as the tables show it: "22 Sept, 14:05". */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
