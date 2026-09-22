import { cn } from '../../lib/cn'

const TONES = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-brand-soft text-brand-dark',
  muted: 'bg-muted-bg text-muted',
}

export default function Badge({ tone = 'muted', size = 'md', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-[10.5px]' : 'h-6 px-2.5 text-[11px]',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Outcome / sentiment / status strings map to one tone in one place. */
const TONE_BY_LABEL = {
  // call outcomes
  Booked: 'ok',
  Resolved: 'ok',
  Completed: 'ok',
  Transferred: 'info',
  Callback: 'info',
  'Callback queued': 'info',
  Voicemail: 'muted',
  'No answer': 'muted',
  Failed: 'danger',
  // sentiment
  Positive: 'ok',
  Neutral: 'muted',
  Negative: 'danger',
  // statuses
  Active: 'ok',
  Live: 'ok',
  Paused: 'muted',
  Pending: 'warn',
  Draft: 'muted',
  Error: 'danger',
  // conversation lifecycle as the workspace reports it
  Ended: 'ok',
  Abandoned: 'warn',
  Escalated: 'warn',
  Unknown: 'muted',
}

export function toneFor(label) {
  return TONE_BY_LABEL[label] ?? 'muted'
}

export function StatusBadge({ label, size = 'md', className }) {
  if (!label) return <span className="text-ink-4">—</span>
  return (
    <Badge tone={toneFor(label)} size={size} className={className}>
      {label}
    </Badge>
  )
}
