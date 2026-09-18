import { useCallback, useEffect, useState } from 'react'

/**
 * Loads one resource, with a sample fallback.
 *
 * Returns `{ data, status, error, isSample, reload }` where status is
 * 'loading' | 'live' | 'sample' | 'error'.
 *
 * A resource that isn't mapped to the live workspace yet resolves to the
 * sample with `isSample: true` — the page renders, and the sidebar badge plus
 * the page banner say where the numbers came from. A genuine failure (bad key,
 * proxy down mid-session, upstream 500) surfaces as 'error' instead of being
 * silently papered over with samples.
 */
export function useResource(load, sample, deps = []) {
  const [state, setState] = useState({ data: sample, status: 'loading', error: null })

  const run = useCallback(() => {
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading', error: null }))

    Promise.resolve()
      .then(load)
      .then((data) => {
        if (!cancelled) setState({ data, status: 'live', error: null })
      })
      .catch((error) => {
        if (cancelled) return
        if (error?.notMapped) {
          setState({ data: sample, status: 'sample', error: null })
        } else {
          setState({ data: sample, status: 'error', error })
        }
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])

  return {
    data: state.data,
    status: state.status,
    error: state.error,
    isSample: state.status === 'sample' || state.status === 'error',
    reload: run,
  }
}
