import { useCallback, useEffect, useRef, useState } from 'react'
import { getRecordings } from '../lib/api'
import { cn } from '../lib/cn'
import Button from './ui/Button'
import { Skeleton } from './ui/States'
import { IconAlert, IconPlay, IconRefresh } from './icons'
import type { Recordings } from '../lib/types'

/**
 * Call audio, one leg at a time.
 *
 * The API hands back pre-signed links that expire (900s at the time of
 * writing), so they are fetched when this mounts rather than alongside the
 * conversation, and a countdown offers a refresh before they lapse. An expired
 * link fails silently inside <audio>, which is the worst possible failure —
 * hence the explicit expiry handling.
 */
export default function RecordingPlayer({
  conversationId,
  className,
}: {
  conversationId: string
  className?: string
}) {
  const [state, setState] = useState<{
    status: 'loading' | 'ready' | 'error'
    data: Recordings | null
    error: Error | null
  }>({ status: 'loading', data: null, error: null })
  const [leg, setLeg] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const load = useCallback(() => {
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })
    getRecordings(conversationId)
      .then((data) => {
        if (cancelled) return
        setState({ status: 'ready', data, error: null })
        setLeg(data.legs[0]?.leg ?? null)
        setSecondsLeft(data.expiresInSeconds ?? null)
      })
      .catch((error) => !cancelled && setState({ status: 'error', data: null, error }))
    return () => {
      cancelled = true
    }
  }, [conversationId])

  useEffect(load, [load])

  // Count the signed links down so an expired one is visible, not a mute player.
  useEffect(() => {
    if (secondsLeft === null) return
    const t = setInterval(() => setSecondsLeft((s) => (s === null || s <= 0 ? 0 : s - 1)), 1000)
    return () => clearInterval(t)
  }, [secondsLeft === null])

  if (state.status === 'loading') {
    return <Skeleton className={cn('h-24 w-full', className)} />
  }

  if (state.status === 'error') {
    return (
      <div className={cn('flex items-center gap-3 rounded-lg border border-line bg-sunken px-3 py-2.5', className)}>
        <IconAlert size={15} className="shrink-0 text-ink-3" />
        <p className="flex-1 text-xs text-ink-2">
          {state.error?.message ?? 'The recording could not be loaded.'}
        </p>
        <Button size="sm" onClick={load}>
          <IconRefresh size={12} />
          Retry
        </Button>
      </div>
    )
  }

  const legs = state.data?.legs ?? []

  if (legs.length === 0) {
    return (
      <p className={cn('text-xs leading-relaxed text-ink-3', className)}>
        No recording was captured for this call.
      </p>
    )
  }

  // legs.length is checked above, so legs[0] is there; the assertion is for
  // `noUncheckedIndexedAccess` rather than a case that can happen.
  const current = legs.find((l) => l.leg === leg) ?? legs[0]!
  const expired = secondsLeft !== null && secondsLeft <= 0

  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {legs.map((l) => (
          <button
            key={l.leg}
            type="button"
            onClick={() => setLeg(l.leg)}
            aria-pressed={l.leg === current.leg}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
              l.leg === current.leg
                ? 'border-brand bg-brand text-white'
                : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken',
            )}
          >
            <IconPlay size={10} />
            {l.label}
          </button>
        ))}

        <span className="ml-auto text-[11px] text-ink-3">
          {expired ? 'Link expired' : secondsLeft !== null ? `Link valid ${secondsLeft}s` : null}
        </span>
        {expired && (
          <Button size="sm" onClick={load}>
            <IconRefresh size={12} />
            Refresh
          </Button>
        )}
      </div>

      {/* key forces a reload when the leg or a refreshed URL changes */}
      <audio
        ref={audioRef}
        key={current.url}
        src={current.url}
        controls
        preload="none"
        className="w-full"
      >
        Your browser cannot play audio.
      </audio>

      <div className="flex flex-wrap gap-3">
        {legs.map((l) => (
          <a
            key={l.leg}
            href={l.url}
            download={`${conversationId}.${l.leg}.wav`}
            className="text-[11.5px] font-medium text-brand hover:text-brand-dark"
          >
            Download {l.label.toLowerCase()}
          </a>
        ))}
      </div>
    </div>
  )
}
