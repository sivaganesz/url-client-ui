import { useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import Avatar from '../components/ui/Avatar'
import Badge, { StatusBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import DataBanner from '../components/ui/DataBanner'
import Dropdown, { MenuItem } from '../components/ui/Dropdown'
import NewConversationDialog from '../components/NewConversationDialog'
import { ChipGroup, SearchInput } from '../components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import {
  IconAgent,
  IconChat,
  IconChevronDown,
  IconPlus,
  IconSearch,
  channelIcon,
} from '../components/icons'
import { cn } from '../lib/cn'
import ConversationDetail from '../components/conversations/ConversationDetail'
import {
  ANY_AGENT,
  CHANNEL_EDGE,
  CHANNEL_FILTERS,
  GONE_AGENT,
  channelsOf,
} from '../components/conversations/channels'
import { useResource } from '../lib/useResource'
import {
  getConversations,
  timeAgo,
} from '../lib/api'

/** Conversations added to the rail per click of Load more. */
const PAGE = 50

export default function Conversations() {
  const { openDrawer, startCall } = useOutletContext()
  const { id } = useParams()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState('All')
  const [agent, setAgent] = useState(ANY_AGENT.id)
  const [shown, setShown] = useState(PAGE)
  const [starting, setStarting] = useState(false)

  const list = useResource(getConversations, [], [])
  const conversations = list.data

  const channels = useMemo(() => {
    const extra = [...new Set(conversations.map((c) => c.channel).filter(Boolean))].filter(
      (c) => !CHANNEL_FILTERS.includes(c),
    )
    return [...CHANNEL_FILTERS, ...extra]
  }, [conversations])

  /**
   * Agents that actually appear in the loaded conversations, with counts.
   *
   * Listing every agent in the workspace would offer choices that can only
   * return nothing — half of them have no conversations at all. The count
   * beside each name says what picking it will give you.
   */
  const agentOptions = useMemo(() => {
    const seen = new Map()
    let orphans = 0
    for (const c of conversations) {
      if (!c.agent) {
        orphans += 1
        continue
      }
      const at = seen.get(c.agentId) ?? { id: c.agentId, name: c.agent, count: 0 }
      at.count += 1
      seen.set(c.agentId, at)
    }
    const list = [...seen.values()].sort((a, b) => b.count - a.count)
    return [
      { ...ANY_AGENT, count: conversations.length },
      ...list,
      ...(orphans ? [{ ...GONE_AGENT, count: orphans }] : []),
    ]
  }, [conversations])

  const selectedAgent = agentOptions.find((a) => a.id === agent) ?? agentOptions[0]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return conversations.filter((c) => {
      if (channel !== 'All' && c.channel !== channel) return false
      if (agent === GONE_AGENT.id ? Boolean(c.agent) : agent !== ANY_AGENT.id && c.agentId !== agent)
        return false
      if (!q) return true
      return [c.title, c.name, c.phone, c.email].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [conversations, query, channel, agent])

  // A conversation opened by link — from the Dashboard, or a shared URL — can
  // sit past the loaded window. How far the rail must reach to show it is a
  // fact about the current list, not a thing to store: derived here rather
  // than pushed into state by an effect, which cost a second render each time.
  const selectedAt = useMemo(() => filtered.findIndex((c) => c.id === id), [filtered, id])
  const reach = selectedAt >= 0 ? Math.ceil((selectedAt + 1) / PAGE) * PAGE : 0

  // A new search or channel starts from the top again — carrying a deep scroll
  // across filters just hides the best matches behind a button.
  const [prevFilters, setPrevFilters] = useState('')
  const filterKey = `${query}|${channel}|${agent}`
  if (prevFilters !== filterKey) {
    setPrevFilters(filterKey)
    if (shown !== PAGE) setShown(PAGE)
  }

  const visible = filtered.slice(0, Math.max(shown, reach))
  const more = filtered.length - visible.length

  const selectedId = id ?? null
  const selected = conversations.find((c) => c.id === selectedId) ?? null

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── list rail ──────────────────────────────────────── */}
      <aside
        className={cn(
          'w-full shrink-0 flex-col border-r border-line bg-surface md:flex md:w-[22.2rem]',
          selectedId ? 'hidden' : 'flex',
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line p-3">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={openDrawer}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-muted-bg lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <SearchInput
            label="Search conversations by name, email or phone"
            placeholder="Search name, email, phone"
            value={query}
            onChange={setQuery}
            className="min-w-0 flex-1"
          />
          <Button variant="primary" size="md" className="shrink-0" onClick={() => setStarting(true)}>
            <IconPlus size={14} />
            New
          </Button>
        </div>

        {/* One line, not three. The chips scroll sideways rather than wrapping,
            so the filters cost a fixed 44px however many channels exist. */}
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
          <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ChipGroup
              label="Filter by channel"
              options={channels}
              value={channel}
              onChange={setChannel}
              wrap={false}
            />
          </div>

          {/* Set apart from the chips: it filters a different thing, and the
              chips scroll under it. */}
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />

          <Dropdown
            align="right"
            menuClassName="max-h-72 w-60 overflow-auto"
            button={({ open, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                title={selectedAgent.name}
                className={cn(
                  'inline-flex h-7 max-w-[10rem] items-center gap-1 rounded-full border px-2.5 text-[11.5px] transition-colors',
                  agent === ANY_AGENT.id
                    ? 'border-line-strong bg-surface text-ink-2 hover:bg-sunken'
                    : 'border-brand bg-brand font-medium text-white',
                )}
              >
                <IconAgent size={11} className="shrink-0" />
                <span className="truncate">
                  {agent === ANY_AGENT.id ? 'Agent' : selectedAgent.name}
                </span>
                <IconChevronDown size={11} className="shrink-0" />
              </button>
            )}
          >
            {({ close }) =>
              agentOptions.map((a) => (
                <MenuItem
                  key={a.id}
                  selected={a.id === agent}
                  onClick={() => {
                    setAgent(a.id)
                    close()
                  }}
                >
                  <span className="min-w-0 flex-1 truncate" title={a.name}>
                    {a.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{a.count}</span>
                </MenuItem>
              ))
            }
          </Dropdown>
        </div>

        {list.status !== 'live' && list.status !== 'loading' && (
          <div className="border-b border-line p-3">
            <DataBanner
              status={list.status}
              error={list.error}
              onRetry={list.reload}
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {list.status === 'loading' ? (
            <div className="flex flex-col gap-3 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : list.status === 'error' ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={IconSearch}
              title={conversations.length ? 'No matches' : 'No conversations yet'}
              note={
                conversations.length
                  ? `Nothing matches “${query}”${channel !== 'All' ? ` on ${channel}` : ''}.`
                  : 'Conversations appear here as customers reach you.'
              }
            />
          ) : (
            <ul>
              {visible.map((c) => {
                const ChannelIcon = channelIcon[c.channel] ?? IconChat
                const active = c.id === selectedId
                const summary = c.preview && c.preview !== 'No summary available.' ? c.preview : null
                return (
                  <li key={c.id}>
                    <Link
                      to={`/conversations/${c.id}`}
                      aria-current={active ? 'true' : undefined}
                      title={`${c.title} · ${c.channel} · ${c.status}`}
                      className={cn(
                        'flex items-start gap-2.5 border-b border-line/70 py-2.5 pr-3 pl-2.5 transition-colors',
                        active ? 'bg-brand-soft' : 'hover:bg-sunken',
                      )}
                    >
                      {/* The badges below name the channel and status; this
                          just lets the shape of the list read while scrolling. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'w-[3px] shrink-0 self-stretch rounded-full',
                          CHANNEL_EDGE[c.channel] ?? 'bg-channel-any',
                        )}
                      />

                      {c.name ? (
                        <Avatar name={c.name} size="sm" />
                      ) : (
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted-bg text-ink-4">
                          <ChannelIcon size={14} />
                        </span>
                      )}

                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="truncate text-[12.5px] font-semibold">{c.title}</span>
                          {!c.name && c.ref && (
                            <span className="shrink-0 font-mono text-[10px] text-ink-4">{c.ref}</span>
                          )}
                          <span className="ml-auto shrink-0 text-[10.5px] text-ink-3">
                            {timeAgo(c.updatedAt ?? c.createdAt) || c.time}
                          </span>
                        </div>

                        {/* Dropped entirely when there is nothing to say, rather
                            than spending a line on "No summary available." */}
                        {summary && (
                          <p className="truncate text-[11.5px] text-ink-3 italic">{summary}</p>
                        )}

                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          {/* Every channel the thread has touched. A web chat
                              that moved to voice is two, and showing only the
                              first hides half of what happened. */}
                          {channelsOf(c).map((ch) => {
                            const Icon = channelIcon[ch] ?? IconChat
                            return (
                              <Badge key={ch} tone="muted" size="sm">
                                <Icon size={10} />
                                {ch}
                              </Badge>
                            )
                          })}
                          <StatusBadge label={c.status} size="sm" />
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}

              {more > 0 && (
                <li className="p-3">
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE)}
                    className="w-full rounded-lg border border-line-strong bg-surface py-2 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand"
                  >
                    Load more ({visible.length} of {filtered.length})
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-line px-3 py-2 text-center text-[11px] text-ink-3">
          {list.status === 'loading'
            ? 'Loading…'
            : `${visible.length} of ${filtered.length} conversations`}
        </div>
      </aside>

      {/* ── detail ─────────────────────────────────────────── */}
      <section
        className={cn(
          'min-w-0 flex-1 flex-col bg-canvas md:flex',
          selectedId ? 'flex' : 'hidden',
        )}
      >
        {!selected ? (
          <EmptyState
            className="flex-1"
            icon={IconChat}
            title="Select a conversation"
            note="Pick a thread to read its summary, transcript and customer profile."
          />
        ) : (
          <ConversationDetail
            key={selected.id}
            conversation={selected}
            onBack={() => navigate('/conversations')}
            onCalling={startCall}
          />
        )}
      </section>

      {/* Mounted only while open: it reads every agent's graph to work out
          which channels each can be reached on, and that shouldn't cost
          anything on a page load where nobody opens it. */}
      {starting && (
        <NewConversationDialog
          open
          onClose={() => setStarting(false)}
          onStarted={({ conversationId, channel: ch, to, agentName }) => {
            setStarting(false)
            // The thread is new, so the rail has to refetch before it can
            // highlight where we just landed.
            list.reload()
            if (ch === 'phone') startCall({ name: agentName ?? to, phone: to, conversationId })
            if (conversationId) navigate(`/conversations/${conversationId}`)
          }}
        />
      )}
    </div>
  )
}

