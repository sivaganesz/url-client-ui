import { useCallback, useEffect, useRef, useState } from 'react'
import { getRecordings } from '../lib/api'

/**
 * Plays one call recording at a time, with no player UI.
 *
 * The Call Log only needs the full call — the per-leg breakdown lives on the
 * Conversation page — so this fetches the combined track and drives a single
 * detached Audio element. Starting another call stops the first, since two
 * recordings talking over each other is never what someone wants.
 *
 * Signed URLs expire (900s), so a fresh one is fetched each time a call is
 * started rather than caching a link that may already be dead. Pausing keeps
 * the loaded track, so resuming is instant and doesn't re-fetch.
 */

/** Clearing src makes the element fire `error`; drop the handlers first. */
function release(audio) {
  if (!audio) return
  audio.onended = null
  audio.ontimeupdate = null
  audio.onloadedmetadata = null
  audio.onerror = null
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
}

export function useCallAudio() {
  const audioRef = useRef(null)
  const tokenRef = useRef(0)
  const [state, setState] = useState({ id: null, status: 'idle', error: null })
  const [clock, setClock] = useState({ at: 0, of: 0 })

  const stop = useCallback(() => {
    tokenRef.current += 1
    release(audioRef.current)
    setState({ id: null, status: 'idle', error: null })
    setClock({ at: 0, of: 0 })
  }, [])

  // Never leave audio playing after the page goes away.
  useEffect(() => () => release(audioRef.current), [])

  const toggle = useCallback(
    async (callId) => {
      const audio = audioRef.current

      // Same call: pause and resume in place, no refetch.
      if (state.id === callId && audio) {
        if (state.status === 'playing') {
          audio.pause()
          setState((s) => ({ ...s, status: 'paused' }))
          return
        }
        if (state.status === 'paused') {
          try {
            await audio.play()
            setState((s) => ({ ...s, status: 'playing' }))
          } catch (err) {
            setState({ id: callId, status: 'error', error: err })
          }
          return
        }
      }

      stop()
      const token = ++tokenRef.current
      setState({ id: callId, status: 'loading', error: null })

      try {
        const { legs } = await getRecordings(callId)
        // Fall back to whatever leg exists if there is no combined track.
        const track = legs.find((l) => l.leg === 'combined') ?? legs[0]
        if (!track) throw new Error('No recording available for this call.')
        if (token !== tokenRef.current) return // a newer request took over

        // Built and wired up before it goes into the ref, never after. A
        // half-configured element in the ref is one an unmount could tear down
        // mid-setup, and `stop()` above has already released the previous one.
        const el = new Audio()
        el.src = track.url

        const seen = () => (Number.isFinite(el.duration) ? el.duration : 0)
        el.ontimeupdate = () => setClock({ at: el.currentTime || 0, of: seen() })
        el.onloadedmetadata = () => setClock({ at: 0, of: seen() })
        el.onended = () => {
          setState({ id: null, status: 'idle', error: null })
          setClock({ at: 0, of: 0 })
        }
        // Only a genuine playback failure, never our own teardown — release()
        // detaches this before touching src.
        el.onerror = () =>
          setState({ id: callId, status: 'error', error: new Error('Could not play this recording.') })

        audioRef.current = el
        await el.play()
        if (token !== tokenRef.current) return
        setState({ id: callId, status: 'playing', error: null })
      } catch (err) {
        if (token !== tokenRef.current) return
        setState({ id: callId, status: 'error', error: err })
      }
    },
    [state.id, state.status, stop],
  )

  return { ...state, toggle, stop, at: clock.at, of: clock.of }
}
