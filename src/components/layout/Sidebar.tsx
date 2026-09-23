import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import {
  IconAgent,
  IconAnalytics,
  IconChat,
  IconDashboard,
  IconHash,
  IconPhone,
} from '../icons'
import { useSession } from '../../lib/session'
import Avatar from '../ui/Avatar'

const SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: IconDashboard, end: true },
      { to: '/analytics', label: 'Analytics', icon: IconAnalytics },
    ],
  },
  {
    label: 'Engage',
    items: [
      { to: '/conversations', label: 'Conversations', icon: IconChat },
      { to: '/call-logs', label: 'Call Log Analytics', icon: IconPhone },
    ],
  },
  {
    label: 'Configure',
    items: [
      { to: '/agents', label: 'AI Agents', icon: IconAgent },
      { to: '/phone-numbers', label: 'Phone Numbers', icon: IconHash },
    ],
  },
]

export default function Sidebar({
  onNavigate,
}: {
  /** Called after a link is followed, so the mobile drawer can close itself. */
  onNavigate?: () => void
}) {
  const { user, workspace, signOut } = useSession()

  return (
    <nav
      aria-label="Main"
      className="flex h-full w-58 shrink-0 flex-col border-r border-line bg-sunken py-4"
    >
      <div className="flex items-center gap-2.5 px-4 pb-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
          <IconChat size={15} />
        </span>
        {/* The workspace this console is pointed at, not a fixed product name.
            It read "Siva Workspace" whatever the key actually connected to. */}
        <span className="truncate text-[13.5px] font-semibold tracking-tight">
          {workspace?.name || 'Workspace'}
        </span>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.label}>
          <div className="px-4 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-ink-4 uppercase">
            {section.label}
          </div>
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'mx-2.5 mb-0.5 flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors',
                  isActive
                    ? 'bg-brand-soft font-semibold text-brand'
                    : 'text-ink hover:bg-muted-bg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={16} className={isActive ? 'text-brand' : 'text-ink-3'} />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}

      <div className="flex-1" />

{/* A workspace with no Perfox credentials yet is a real state, not a
          failure: the account exists and someone has still to configure it.
          Saying so here beats six pages of unexplained error banners. */}
      {workspace && !workspace.configured && (
        <div className="mx-2.5 mb-2 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn-bg px-3 py-2">
          <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
          <span className="text-[11px] leading-relaxed text-ink-2">
            This workspace is not connected yet.
          </span>
        </div>
      )}

      {/* A real account block now, unlike the "[Account name]" placeholder
          that used to sit here over a hardcoded workspace. */}
      {user && (
        <div className="mx-2.5 mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted-bg">
          <Avatar name={user.name} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[12px] font-medium" title={user.name}>
              {user.name}
            </span>
            <span className="truncate text-[10.5px] text-ink-3" title={user.email}>
              {user.email}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="shrink-0 rounded-md px-1.5 py-1 text-[10.5px] font-medium text-ink-3 hover:bg-surface hover:text-ink"
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  )
}
