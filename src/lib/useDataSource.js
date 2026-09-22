import { useEffect, useState } from 'react'

/**
 * Probes the local proxy once on boot.
 *
 * The browser never holds the Perfox key, so "are we live?" is really "is the
 * proxy up and does it have a key?". It also reports which workspace the key
 * connects to, which the sidebar names — pointing .env somewhere else used to
 * leave the console still announcing the old workspace over the new data.
 */
export function useDataSource() {
  const [source, setSource] = useState({ live: false, workspace: null, label: 'Checking data source…' })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)

    fetch('/api/health', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => {
        if (cancelled) return
        // Only name the workspace when the proxy tells us one. Falling back to
        // a hardcoded name would state something we don't know.
        setSource(
          body?.keyConfigured
            ? {
                live: true,
                workspace: body.workspace ?? null,
                label: body.workspace ? `Live · ${body.workspace}` : 'Live',
              }
            : { live: false, workspace: null, label: 'No API key configured' },
        )
      })
      .catch(() => {
        if (!cancelled) setSource({ live: false, workspace: null, label: 'Workspace unreachable' })
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
