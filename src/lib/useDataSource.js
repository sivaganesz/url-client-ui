import { useEffect, useState } from 'react'

/**
 * Probes the local proxy once on boot.
 *
 * The browser never holds the Perfox key, so "are we live?" is really "is the
 * proxy up and does it have a key?". When it isn't, pages fall back to the
 * bundled samples and the sidebar says so rather than quietly showing fiction.
 */
export function useDataSource() {
  const [source, setSource] = useState({ live: false, label: 'Checking data source…' })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)

    fetch('/api/health', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => {
        if (cancelled) return
        setSource(
          body?.keyConfigured
            ? { live: true, label: `Live · ${body.workspace ?? 'siva-workspace'}` }
            : { live: false, label: 'Sample data · no API key' },
        )
      })
      .catch(() => {
        if (!cancelled) setSource({ live: false, label: 'Sample data · proxy offline' })
      })
      .finally(() => clearTimeout(timer))

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [])

  return source
}
