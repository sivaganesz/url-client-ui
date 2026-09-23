import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

/** A resource that could not be loaded because no endpoint exists for it yet. */
export interface UnavailableLike extends Error {
  notMapped?: boolean
}

export type ResourceStatus = 'loading' | 'ready' | 'error' | 'unavailable'

export interface Resource<T> {
  data: T
  status: ResourceStatus
  error: Error | null
  reload: () => void
}

/** An abort is our own doing — a remount or a refetch — never a failure to report. */
const aborted = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as Error).name === 'AbortError'

/**
 * Loads one resource.
 *
 * `empty` is the shape to render before anything arrives and after a failure —
 * an empty array, or an object of nulls. It is deliberately not sample data.
 * A page that fails must say so; showing invented conversations, agents or
 * numbers in place of an error is worse than showing nothing, because the
 * reader has no way to tell which they are looking at.
 *
 * `data` is typed as `T` rather than `T | undefined` precisely because of that
 * contract: there is always something to render, so no caller needs a guard.
 *
 * 'unavailable' is the separate case of a resource the workspace has no
 * endpoint for. That is not a failure to retry — it is a feature that does not
 * exist yet — so pages explain it rather than offering a Retry button.
 *
 * `load` is called with an AbortSignal. Loaders that pass it down stop their
 * request when the component unmounts or the deps change; ones that ignore it
 * still work, they just run to completion and have their result discarded.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => T | Promise<T>,
  empty: T,
  deps: DependencyList = [],
): Resource<T> {
  const [state, setState] = useState<{ data: T; status: ResourceStatus; error: Error | null }>({
    data: empty,
    status: 'loading',
    error: null,
  })

  // The run in progress. Retry can fire while the first is still going, and
  // without this both would settle and the slower one would win on timing
  // rather than on recency.
  const active = useRef<AbortController | null>(null)

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
      .catch((error: UnavailableLike) => {
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
