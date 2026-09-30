import { useCallback, useEffect, useState } from 'react'

/**
 * Light or dark, remembered.
 *
 * The class goes on `<html>`, and every colour in the app is a CSS variable
 * that resolves differently under it — so nothing else in the interface knows
 * a theme exists. See src/index.css.
 *
 * The first paint is handled by a small script in index.html rather than here:
 * an effect runs after React has already drawn, which is a white flash on
 * every load for anyone who chose dark. This hook only has to agree with what
 * that script already did.
 */
export type Theme = 'light' | 'dark'

const KEY = 'ui-theme'

/**
 * Storage can throw, not merely come back empty.
 *
 * A private window, blocked site data, or an embedded frame all raise on
 * access rather than returning null, and an unhandled one here would take the
 * whole app down over a preference.
 */
function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

function remember(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Nothing to do: the theme still applies for this session.
  }
}

/** What the operating system asks for, when nobody has chosen. */
const preferred = (): Theme =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'

export const currentTheme = (): Theme => stored() ?? preferred()

function apply(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  // So form controls, scrollbars and the like follow too, without styling
  // each one by hand.
  document.documentElement.style.colorScheme = theme
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme)

  // Only when nobody has chosen: an explicit choice outranks the system, and
  // should not be overwritten because the machine changed at sunset.
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-color-scheme: dark)')
    const follow = (e: MediaQueryListEvent) => {
      if (stored()) return
      const next: Theme = e.matches ? 'dark' : 'light'
      apply(next)
      setTheme(next)
    }
    query.addEventListener('change', follow)
    return () => query.removeEventListener('change', follow)
  }, [])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      apply(next)
      remember(next)
      return next
    })
  }, [])

  return { theme, toggle }
}
