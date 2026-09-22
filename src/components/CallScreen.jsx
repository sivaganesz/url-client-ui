import { useEffect, useState } from 'react'
import Avatar from './ui/Avatar'
import { IconMicOff, IconPause, IconPhoneDown, IconPlay } from './icons'
import { cn } from '../lib/cn'
import { clock } from '../lib/format'

/**
 * The live call, pinned to the corner.
 *
 * Deliberately not a modal: a call runs while you carry on reading, so this
 * floats above the page rather than blocking it. It outlives navigation
 * because it is mounted by the shell, not by a page.
 *
 * Mute and Hold are UI only for now — the controls exist and hold their state,
 * but nothing is wired to the voice stream yet.
 */
export default function CallScreen({ call, onEnd }) {
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [held, setHeld] = useState(false)

  // The clock starts when the panel appears and counts the call, not the hold.
  useEffect(() => {
    if (held) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [held])

  if (!call) return null

  const state = held ? 'On hold' : seconds < 3 ? 'Calling…' : 'In call'

  return (
    <div
      role="dialog"
      aria-label={`Call with ${call.name}`}
      className="fixed right-4 bottom-4 z-40 w-[17.5rem] overflow-hidden rounded-card border border-line bg-surface shadow-raised sm:right-6 sm:bottom-6"
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

      <div className="flex items-center justify-between gap-2 border-t border-line bg-sunken px-4 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2">
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              held ? 'bg-warn' : 'animate-pulse bg-ok',
            )}
          />
          {state}
        </span>
        <span className="font-mono text-[11.5px] tabular-nums text-ink-3">{clock(seconds)}</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 p-3">
        <CallButton
          icon={IconMicOff}
          label={muted ? 'Unmute' : 'Mute'}
          active={muted}
          onClick={() => setMuted((v) => !v)}
        />
        <CallButton
          icon={held ? IconPlay : IconPause}
          label={held ? 'Resume' : 'Hold'}
          active={held}
          onClick={() => setHeld((v) => !v)}
        />
        <CallButton icon={IconPhoneDown} label="End" tone="danger" onClick={onEnd} />
      </div>
    </div>
  )
}

function CallButton({ icon: Icon, label, active = false, tone, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={tone ? undefined : active}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border py-2 text-[10.5px] font-medium transition-colors',
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

