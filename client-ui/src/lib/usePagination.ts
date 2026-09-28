import { useEffect, useMemo, useRef, useState } from 'react'

export interface PaginationOptions {
  sizes: number[]
  initial?: number
  /** Whatever identifies the current filter — change it and paging restarts. */
  resetKey?: string
  /** Fires before the visible rows change, for callers with something to tear down. */
  onLeavePage?: () => void
}

export interface Pagination<T> {
  rows: T[]
  sizes: number[]
  perPage: number
  setPerPage: (n: number) => void
  page: number
  pageCount: number
  from: number
  total: number
  goto: (next: number) => void
}

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
export function usePagination<T>(
  items: readonly T[],
  { sizes, initial = sizes[0] ?? 25, resetKey, onLeavePage }: PaginationOptions,
): Pagination<T> {
  const [perPage, setPerPage] = useState(initial)
  const [page, setPage] = useState(1)

  // Held in a ref so an inline callback doesn't re-run the reset every render.
  // Written in an effect rather than during render: render must stay pure, or
  // a re-render React discards can leave the ref pointing at a stale closure.
  const leave = useRef(onLeavePage)
  useEffect(() => {
    leave.current = onLeavePage
  }, [onLeavePage])

  const pageCount = Math.max(1, Math.ceil(items.length / perPage))
  const current = Math.min(page, pageCount)
  const from = (current - 1) * perPage
  const rows = useMemo(() => items.slice(from, from + perPage), [items, from, perPage])

  // Reset during render rather than in an effect: an effect commits a render
  // showing page 7 of the old list before correcting it, which is a wasted
  // render and a visible flicker on a slow list.
  const key = `${resetKey}|${perPage}`
  const [prevKey, setPrevKey] = useState(key)
  if (prevKey !== key) {
    setPrevKey(key)
    if (page !== 1) setPage(1)
  }

  // The teardown stays in an effect — it stops audio, which is the outside
  // world, and render has to remain pure.
  useEffect(() => {
    leave.current?.()
  }, [resetKey, perPage])

  const goto = (next: number) => {
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
