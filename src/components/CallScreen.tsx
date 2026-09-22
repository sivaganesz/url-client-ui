import Avatar from './ui/Avatar'
import { IconAlert, IconMicOff, IconPause, IconPhoneDown, IconPlay, IconX } from './icons'
import { cn } from '../lib/cn'
import { clock } from '../lib/format'
import { useCall, useCallSeconds } from '../lib/operator'
import type { IconProps } from './icons'

/**
 * The live call, pinned to the corner.
 *
 * Deliberately not a modal: a call runs while you carry on reading, so this
 * floats above the page rather than blocking it. It outlives navigation
 * because it is mounted by the shell, not by a page.
 *
 * Mute and Hold act on the real audio stream — the operator connector puts the
 * person wearing the headset on the call, so there is something local to act
 * on. They are disabled until the call is actually up, because there is no
 * room to act on while it is still ringing.
 */
export default function CallScreen() {
  const { call, error, end, hold, mute, dismissError } = useCall()
  const seconds = useCallSeconds(call)

  if (!call) return null

  const live = call.status === 'live'
  const state = call.onHold
    ? 'On hold'
    : { dialing: 'Calling…', ringing: 'Ringing…', live: 'In call', ended: 'Ended' }[call.status]

  return (
    <div
      role="dialog"
      aria-label={`Call with ${call.name}`}
      /* Full width less a gutter on a phone, where a fixed 280px panel crowds
         the composer it floats over; its own size from `sm` up. */
      className="fixed right-4 bottom-4 left-4 z-40 overflow-hidden rounded-card border border-line bg-surface shadow-raised sm:right-6 sm:bottom-6 sm:left-auto sm:w-[17.5rem]"
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <Avatar name={call.name} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold" title={call.name}>
            {call.name}
          </span>
          {call.phone && (
            <span className="truncate font-mono text-[11px] text-ink-3">{call.phone}</span>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 border-t border-danger/25 bg-danger-bg px-4 py-2">
          <IconAlert size={13} className="mt-0.5 shrink-0 text-danger" />
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-2">{error}</p>
          <button
            type="button"
            onClick={dismissError}
            aria-label="Dismiss"
            className="shrink-0 text-ink-3 hover:text-ink"
          >
            <IconX size={12} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line bg-sunken px-4 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              call.onHold ? 'bg-warn' : live ? 'animate-pulse bg-ok' : 'animate-pulse bg-warn',
            )}
          />
          {state}
        </span>
        {/* Only meaningful once the call is up; before that it would count
            ringing as talk time. */}
        <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
          {live || seconds > 0 ? clock(seconds) : '—'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 p-3">
        <CallButton
          icon={IconMicOff}
          label={call.muted ? 'Unmute' : 'Mute'}
          active={call.muted}
          disabled={!live}
          onClick={() => mute(!call.muted)}
        />
        <CallButton
          icon={call.onHold ? IconPlay : IconPause}
          label={call.onHold ? 'Resume' : 'Hold'}
          active={call.onHold}
          disabled={!live}
          onClick={() => hold(!call.onHold)}
        />
        <CallButton icon={IconPhoneDown} label="End" tone="danger" onClick={() => void end()} />
      </div>
    </div>
  )
}

function CallButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  tone,
  onClick,
}: {
  icon: React.ComponentType<IconProps>
  label: string
  active?: boolean
  disabled?: boolean
  tone?: 'danger'
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={tone ? undefined : active}
      title={disabled ? 'Available once the call connects' : label}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border py-2 text-[10.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'danger'
          ? 'border-danger/30 bg-danger-bg text-danger hover:bg-danger hover:text-white'
          : active
            ? 'border-brand bg-brand text-white'
            : 'border-line-strong bg-surface text-ink-2 hover:border-brand-line hover:bg-brand-soft hover:text-brand',
      )}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}
