import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Client-side paging over an already-loaded list.
 *
 * The loaders fetch a resource in full (following cursors where the workspace
 * paginates), so paging here is a slice rather than a round trip. Two things
 * this gets right that a bare `slice` doesn't: a narrower filter can leave the
 * current page past the end of the results, so the page is clamped rather than
 * rendering blank; and changing what's listed returns to the top, because
 * carrying page 7 across a new search hides the best matches behind a button.
 *
 * `resetKey` is whatever identifies the current filter — change it and paging
 * starts over. `onLeavePage` fires before the visible rows change, for callers
 * with something to tear down (the Call Log stops audio, since the row it
 * belongs to is about to leave).
 */
export function usePagination(items, { sizes, initial = sizes[0], resetKey, onLeavePage } = {}) {
  const [perPage, setPerPage] = useState(initial)
  const [page, setPage] = useState(1)

  // Held in a ref so an inline callback doesn't re-run the reset every render.
  const leave = useRef(onLeavePage)
  leave.current = onLeavePage

  const pageCount = Math.max(1, Math.ceil(items.length / perPage))
  const current = Math.min(page, pageCount)
  const from = (current - 1) * perPage
  const rows = useMemo(() => items.slice(from, from + perPage), [items, from, perPage])

  useEffect(() => {
    setPage(1)
    leave.current?.()
  }, [resetKey, perPage])

  const goto = (next) => {
    leave.current?.()
    setPage(Math.min(Math.max(1, next), pageCount))
  }

  return {
    rows,
    sizes,
    perPage,
    setPerPage,
    page: current,
    pageCount,
    from,
    total: items.length,
    goto,
  }
}
