import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../lib/cn'
import { IconChannels, IconChat, IconHome, IconPeople, IconSpark } from './ui'

const NAV = [
  { to: '/', label: 'Overview', icon: IconHome, end: true },
  { to: '/conversations', label: 'Conversations', icon: IconChat },
  { to: '/customers', label: 'Customers', icon: IconPeople },
  { to: '/channels', label: 'Channels', icon: IconChannels },
  { to: '/assistants', label: 'Assistants', icon: IconSpark },
]

/** The rail itself — reused by the desktop column and the mobile drawer. */
function Rail({ onNavigate }) {
  return (
    <div className="flex h-full w-64 flex-col bg-rail text-rail-ink">
      <div className="flex items-center gap-3 px-5 py-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-lift">
          <IconChat size={17} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-serif text-[15px] font-semibold text-rail-bright">
            Customer Activity
          </p>
          <p className="truncate text-[11.5px] text-rail-ink/80">Live assistant report</p>
        </div>
      </div>

      <nav aria-label="Sections" className="flex flex-col gap-1 px-3">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] transition-colors',
                isActive
                  ? 'bg-brand font-medium text-white shadow-lift'
                  : 'text-rail-ink hover:bg-rail-hover hover:text-rail-bright',
              )
            }
          >
            {({ isActive }) => (
              <>
                <n.icon size={18} className={isActive ? 'text-white' : 'text-rail-ink'} />
                <span className="truncate">{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-5 py-5">
        <div className="rounded-xl bg-rail-hover px-3.5 py-3">
          <p className="flex items-center gap-2 text-[12px] font-medium text-rail-bright">
            <span className="h-1.5 w-1.5 rounded-full bg-good-soft" />
            Live data
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-rail-ink/85">
            Read-only. Figures come straight from your assistant activity.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Shell() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // The conversations page runs its own two-pane scrolling, like a mail app.
  // Every other page scrolls normally inside a centred column.
  const split = pathname.startsWith('/conversations')

  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      <aside className="sticky top-0 hidden h-dvh shrink-0 lg:flex">
        <Rail />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/50"
          />
          <div className="absolute inset-y-0 left-0 shadow-lift">
            <Rail onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-rule bg-paper/85 px-5 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:bg-sunk"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <span className="font-serif text-[16px] font-semibold">Customer Activity</span>
        </header>

        <main className={cn('min-h-0 flex-1', split ? 'overflow-hidden' : 'overflow-auto')}>
          {split ? (
            <Outlet />
          ) : (
            <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
              <Outlet />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

/** Page title block — every page opens the same way. */
export function PageIntro({ title, children }) {
  return (
    <div className="mb-8">
      <h1 className="text-[28px] sm:text-[32px]">{title}</h1>
      {children && (
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{children}</p>
      )}
    </div>
  )
}
