import { useCallback, useEffect, useRef, useState } from 'react'

/** An abort is our own doing — a remount or a refetch — never a failure to report. */
const aborted = (err) => err?.name === 'AbortError'

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
 *
 * `load` is called with an AbortSignal. Loaders that pass it down stop their
 * request when the component unmounts or the deps change; ones that ignore it
 * still work, they just run to completion and have their result discarded.
 */
export function useResource(load, empty = null, deps = []) {
  const [state, setState] = useState({ data: empty, status: 'loading', error: null })

  // The run in progress. Retry can fire while the first is still going, and
  // without this both would settle and the slower one would win on timing
  // rather than on recency.
  const active = useRef(null)

  const run = useCallback(() => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    setState((s) => ({ ...s, status: 'loading', error: null }))

    Promise.resolve()
      .then(() => load(controller.signal))
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, status: 'ready', error: null })
      })
      .catch((error) => {
        if (controller.signal.aborted || aborted(error)) return
        setState({
          data: empty,
          status: error?.notMapped ? 'unavailable' : 'error',
          error,
        })
      })

    return () => controller.abort()
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
