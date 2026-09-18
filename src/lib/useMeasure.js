import { useEffect, useRef, useState } from 'react'

/**
 * Width/height of a DOM node, tracked through resizes.
 *
 * Charts are drawn at real pixel sizes rather than scaled by a viewBox, so a
 * 2px stroke stays 2px at every container width.
 */
export function useMeasure() {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((prev) =>
        Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
          ? prev
          : { width, height },
      )
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  return [ref, size]
}

/** Round a max value up to a readable axis top (1-2-5 progression). */
export function niceMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const base = 10 ** exp
  const n = value / base
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * base
}
