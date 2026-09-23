import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

export type ResourceStatus = 'loading' | 'ready' | 'error'

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
 * There used to be a fourth state, 'unavailable', for a resource the
 * workspace had no endpoint for. Phone numbers was the last of those, and it
 * has one now — so nothing can produce that state any more and it is gone. A
 * state the code cannot reach is worse than no state: it reads as a case
 * somebody has thought about.
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
      .catch((error: Error) => {
        if (controller.signal.aborted || aborted(error)) return
        setState({ data: empty, status: 'error', error })
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
