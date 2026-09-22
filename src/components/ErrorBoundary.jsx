import { Component } from 'react'
import Button from './ui/Button'
import { IconAlert, IconRefresh } from './icons'

/**
 * Catches render errors so one broken component doesn't blank the console.
 *
 * A class because `componentDidCatch` has no hook equivalent — this is the one
 * place React still requires one.
 *
 * Two levels are wired up, and they fail differently on purpose:
 *   · around the router — the last resort, offers a reload
 *   · around each page   — keeps the sidebar and navigation alive, so a broken
 *                          page costs you that page rather than the whole app
 *
 * `resetKey` changes on navigation, which clears a caught error: moving to
 * another page should not leave you looking at the last one's failure.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error, info) {
    // Kept for the browser console and any future reporting hook. Not shown to
    // the user: a component stack is noise to everyone but a developer.
    console.error('[ui] render error', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const { title, note, level = 'page' } = this.props

    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger">
            <IconAlert size={22} />
          </span>

          <h2 className="text-[15px] font-semibold text-ink">
            {title ?? 'Something went wrong on this page'}
          </h2>

          <p className="text-xs leading-relaxed text-ink-2">
            {note ??
              'The page stopped unexpectedly. Nothing was lost — try again, and if it keeps happening let us know what you were doing.'}
          </p>

          {/* The message only helps a developer, and in a client's hands it
              reads as a leak. Development builds show it; production doesn't. */}
          {import.meta.env.DEV && (
            <pre className="max-w-full overflow-auto rounded bg-sunken p-2 text-left font-mono text-[10.5px] whitespace-pre-wrap text-ink-3">
              {String(this.state.error?.message ?? this.state.error)}
            </pre>
          )}

          <div className="mt-1 flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => this.setState({ error: null })}>
              <IconRefresh size={14} />
              Try again
            </Button>
            {level === 'app' && (
              <Button size="sm" onClick={() => window.location.reload()}>
                Reload the page
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
