import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import CallScreen from '../CallScreen'
import ErrorBoundary from '../ErrorBoundary'
import { PageSkeleton } from '../ui/States'
import { cn } from '../../lib/cn'
import type { CallTarget, DataSource } from '../../lib/types'

/**
 * Fixed sidebar from `lg` up; a dismissible drawer below it. The main column
 * owns its own scrolling so page headers can stay put.
 */
export default function AppShell({ source }: { source: DataSource }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  // The live call lives here rather than on a page, so it survives navigating
  // away from wherever it was placed.
  const [call, setCall] = useState<CallTarget | null>(null)
  const location = useLocation()

  // Close the drawer on navigation and on Escape.
  useEffect(() => setDrawerOpen(false), [location.pathname])
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <div className="hidden lg:flex">
        <Sidebar source={source} />
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/30"
          />
          <div className="absolute inset-y-0 left-0 shadow-raised">
            <Sidebar source={source} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Page-level, inside the shell: a page that throws leaves the sidebar
          and navigation working, so you can move on instead of reloading.
          Keyed by path so navigating away clears a caught error. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <ErrorBoundary resetKey={location.pathname}>
          {/* Routes are code-split, so the first visit to one waits on its
              chunk. Inside the boundary: a chunk that fails to load is a
              render error, and should be caught like any other. */}
          <Suspense fallback={<PageSkeleton />}>
            <Outlet
              context={{
                openDrawer: () => setDrawerOpen(true),
                startCall: setCall,
                endCall: () => setCall(null),
              }}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      <CallScreen call={call} onEnd={() => setCall(null)} />
    </div>
  )
}

/**
 * Sticky page header. `actions` sit right; `tabs` render flush to the bottom
 * edge so an underlined tab bar meets the border cleanly.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  onOpenDrawer,
  className,
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  onOpenDrawer?: () => void
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-5 sm:px-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {onOpenDrawer && (
          <button
            type="button"
            aria-label="Open navigation"
            onClick={onOpenDrawer}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-muted-bg lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-[17px] font-semibold tracking-tight">{title}</h1>
          {subtitle && <span className="hidden truncate text-xs text-ink-3 sm:block">{subtitle}</span>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Scrollable body below a PageHeader. */
export function PageBody({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-auto p-5 sm:p-6', className)}>{children}</div>
  )
}
