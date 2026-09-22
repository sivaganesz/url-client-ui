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
import type { DataSource } from '../../lib/types'

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
  source,
}: {
  /** Called after a link is followed, so the mobile drawer can close itself. */
  onNavigate?: () => void
  /** Where the workspace data came from, shown in the footer. */
  source?: DataSource
}) {
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
          {source?.workspace ?? 'Workspace'}
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

      {source && (
        <div className="mx-2.5 mb-2 flex items-center gap-2 rounded-lg bg-muted-bg px-3 py-2">
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              source.live ? 'bg-ok' : 'bg-warn',
            )}
          />
          <span className="truncate text-[11px] text-ink-2">{source.label}</span>
        </div>
      )}

      {/* The account block that sat here showed "[Account name]" over a
          hardcoded workspace — a placeholder identity presented to whoever was
          looking. There is no sign-in in this console, so there is no account
          to name; the source indicator above already says which workspace the
          data comes from. */}
    </nav>
  )
}
