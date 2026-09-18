import { useCallback, useEffect, useState } from 'react'

/** Load one thing. No sample fallback here — a client should never be shown
 *  invented figures, so a failure says so plainly instead. */
export function useResource(load, deps = []) {
  const [state, setState] = useState({ data: null, status: 'loading', error: null })

  const run = useCallback(() => {
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading', error: null }))
    Promise.resolve()
      .then(load)
      .then((data) => !cancelled && setState({ data, status: 'ready', error: null }))
      .catch((error) => !cancelled && setState({ data: null, status: 'error', error }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])
  return { ...state, reload: run }
}
