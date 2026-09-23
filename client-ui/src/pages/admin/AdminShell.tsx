import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import Avatar from '../../components/ui/Avatar'
import { cn } from '../../lib/cn'
import ChangePasswordDialog from '../../components/ChangePasswordDialog'
import ErrorBoundary from '../../components/ErrorBoundary'
import { IconChat } from '../../components/icons'
import { adminApi, useAdmin } from '../../lib/admin'

/**
 * The admin surface.
 *
 * Deliberately plain, and deliberately unlike the console — dark bar, one
 * section, no workspace anywhere. There is nothing here to browse: an admin
 * provisions accounts and does not read anybody's conversations, and the
 * chrome should not suggest otherwise.
 */
export default function AdminShell() {
  const { admin, signOut } = useAdmin()
  const [changing, setChanging] = useState(false)

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-ink px-5 text-white sm:px-6">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
          <IconChat size={15} />
        </span>
        <span className="text-[14px] font-semibold tracking-tight">Administration</span>

        {/* Two sections now that administrators can be listed, so the header
            has to say which one you are in. Still no workspace anywhere. */}
        <nav aria-label="Admin" className="ml-4 flex items-center gap-1">
          {[
            { to: '/admin', label: 'Customers', end: true },
            { to: '/admin/admins', label: 'Administrators', end: false },
            { to: '/admin/activity', label: 'Activity', end: false },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
                  isActive ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <span className="ml-auto flex items-center gap-3">
          {admin && (
            <span className="hidden items-center gap-2 sm:flex">
              <Avatar name={admin.name} size="sm" />
              <span className="truncate text-[12px] text-white/75" title={admin.email}>
                {admin.email}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="rounded-md px-2 py-1 text-[11.5px] font-medium text-white/70 hover:bg-white/10 hover:text-white"
          >
            Change password
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md px-2 py-1 text-[11.5px] font-medium text-white/70 hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </span>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-5 sm:p-8">
        {/* Keyed by nothing in particular: one route lives here, and a throw
            in it should leave the header and the sign-out button working. */}
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
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
