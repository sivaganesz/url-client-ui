const nf = new Intl.NumberFormat('en-IN')

export const num = (v) => (v == null || Number.isNaN(v) ? '—' : nf.format(v))
export const pct = (v, d = 0) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`)

/** "2 hours ago", "yesterday", "9 Sept" — how a person says it. */
export function whenAgo(iso) {
  if (!iso) return '—'
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return '—'
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`
  const days = Math.round(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export const dateLong = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export const clock = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

export const dayStamp = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''
