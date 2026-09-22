import { useCallback, useEffect, useState } from 'react'

/**
 * Loads one resource.
 *
 * Returns `{ data, status, error, reload }` where status is
 * 'loading' | 'ready' | 'error' | 'unavailable'.
 *
 * `empty` is the shape to render before anything arrives and after a failure —
 * an empty array, or an object of nulls. It is deliberately not sample data.
 * A page that fails must say so; showing invented conversations, agents or
 * numbers in place of an error is worse than showing nothing, because the
 * reader has no way to tell which they are looking at.
 *
 * 'unavailable' is the separate case of a resource the workspace has no
 * endpoint for. That is not a failure to retry — it is a feature that does not
 * exist yet — so pages explain it rather than offering a Retry button.
 */
export function useResource(load, empty = null, deps = []) {
  const [state, setState] = useState({ data: empty, status: 'loading', error: null })

  const run = useCallback(() => {
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading', error: null }))

    Promise.resolve()
      .then(load)
      .then((data) => {
        if (!cancelled) setState({ data, status: 'ready', error: null })
      })
      .catch((error) => {
        if (cancelled) return
        setState({
          data: empty,
          status: error?.notMapped ? 'unavailable' : 'error',
          error,
        })
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
    reload: run,
  }
}
