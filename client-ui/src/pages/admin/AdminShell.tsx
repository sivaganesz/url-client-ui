import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Avatar from '../../components/ui/Avatar'
import { cn } from '../../lib/cn'
import ChangePasswordDialog from '../../components/ChangePasswordDialog'
import ErrorBoundary from '../../components/ErrorBoundary'
import { IconAgent, IconChat, IconClock, IconGrid } from '../../components/icons'
import { adminApi, useAdmin } from '../../lib/admin'

const SECTIONS = [
  { to: '/admin', label: 'Customers', icon: IconGrid, end: true },
  { to: '/admin/admins', label: 'Administrators', icon: IconAgent, end: false },
  { to: '/admin/activity', label: 'Activity', icon: IconClock, end: false },
]

/**
 * The admin surface.
 *
 * Deliberately plain, and deliberately unlike the console — no workspace
 * anywhere. There is nothing here to browse: an admin provisions accounts and
 * does not read anybody's conversations, and the chrome should not suggest
 * otherwise.
 *
 * A sidebar rather than a bar across the top, now that there are three
 * sections as well as an identity and two account buttons: all of it competing
 * for one strip of width is what made the header crowded on a laptop and
 * unworkable on a phone. Fixed from `lg`, a drawer below it — the arrangement
 * the console already uses, so the two surfaces behave the same way even while
 * they deliberately look different.
 */
export default function AdminShell() {
  const { admin, signOut } = useAdmin()
  const [changing, setChanging] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  // Closed by the link that navigates rather than by an effect watching the
  // path: the click is the event, and an effect would be React finding out
  // afterwards.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const nav = (
    <nav
      aria-label="Admin"
      className="flex h-full w-58 shrink-0 flex-col bg-ink py-4 text-white"
    >
      <div className="flex items-center gap-2.5 px-4 pb-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15">
          <IconChat size={15} />
        </span>
        <span className="truncate text-[13.5px] font-semibold tracking-tight">Administration</span>
      </div>

      <div className="px-4 pt-2 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-white/40 uppercase">
        Manage
      </div>
      {SECTIONS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setDrawerOpen(false)}
          className={({ isActive }) =>
            cn(
              'mx-2.5 mb-0.5 flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors',
              isActive ? 'bg-white/15 font-semibold text-white' : 'text-white/70 hover:bg-white/10',
            )
          }
        >
          {({ isActive }) => (
            <>
              <item.icon size={16} className={isActive ? 'text-white' : 'text-white/50'} />
              <span className="truncate">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}

      <div className="flex-1" />

      {/* The identity on its own row and the actions under it. Side by side,
          two buttons and an email address share 200px and the address loses —
          it read "admin…", which is no use for telling two accounts apart. */}
      {admin && (
        <div className="mx-2.5 mb-2 flex flex-col gap-1.5 rounded-lg px-2 py-2">
          <span className="flex items-center gap-2.5">
            <Avatar name={admin.name} size="sm" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12px] font-medium" title={admin.name}>
                {admin.name}
              </span>
              <span className="truncate text-[10.5px] text-white/50" title={admin.email}>
                {admin.email}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setChanging(true)}
              className="rounded-md px-1.5 py-1 text-[10.5px] font-medium text-white/60 hover:bg-white/10 hover:text-white"
            >
              Change password
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="ml-auto rounded-md px-1.5 py-1 text-[10.5px] font-medium text-white/60 hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </span>
        </div>
      )}
    </nav>
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <div className="hidden lg:flex">{nav}</div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 shadow-raised">{nav}</div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Only below `lg`, where the sidebar is a drawer and something has to
            open it. On a wide screen the sidebar is the header. */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-muted-bg"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-[14px] font-semibold tracking-tight">Administration</span>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-5 sm:p-8">
          {/* Keyed by path: a page that throws leaves the navigation working,
              and moving on clears the caught error. */}
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {changing && (
        <ChangePasswordDialog
          submit={async (current, next) => void (await adminApi.changePassword(current, next))}
          onClose={() => setChanging(false)}
        />
      )}
    </div>
  )
}
