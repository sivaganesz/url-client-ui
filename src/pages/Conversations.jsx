import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import Avatar from '../components/ui/Avatar'
import Badge, { StatusBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import DataBanner from '../components/ui/DataBanner'
import RecordingPlayer from '../components/RecordingPlayer'
import Dropdown, { MenuItem } from '../components/ui/Dropdown'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import NewConversationDialog from '../components/NewConversationDialog'
import { ChipGroup, SearchInput, Tabs } from '../components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import {
  IconAgent,
  IconChat,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconMail,
  IconPhone,
  IconPlus,
  IconSearch,
  IconSms,
  IconSparkle,
  IconX,
  channelIcon,
} from '../components/icons'
import { cn } from '../lib/cn'
import { EMPTY_REACH } from '../lib/shapes'
import { useResource } from '../lib/useResource'
import {
  callInfoOf,
  duration,
  getAgentReach,
  getConversations,
  getMessages,
  startOutbound,
  timeAgo,
} from '../lib/api'

/** Conversations added to the rail per click of Load more. */
const PAGE = 50

/**
 * Channel filters, fixed rather than derived from the data.
 *
 * Deriving them meant a channel with no conversations yet simply had no chip,
 * so there was no way to tell "nothing on SMS" from "SMS isn't a thing here".
 * Anything the workspace reports outside this list is appended, so a new
 * channel still shows up.
 */
const CHANNEL_FILTERS = ['All', 'WhatsApp', 'Web', 'Phone', 'SMS', 'Email']

/**
 * Channel as a colour on the row's leading edge.
 *
 * Where a thread came from, not how it went — the status badge covers that.
 * Anything unmapped falls back to the neutral slate.
 */
const CHANNEL_EDGE = {
  Web: 'bg-channel-web',
  WhatsApp: 'bg-channel-whatsapp',
  Phone: 'bg-channel-phone',
  SMS: 'bg-channel-sms',
  Email: 'bg-channel-email',
}

/**
 * Every channel a conversation has touched, the one it started on first.
 *
 * `channel` is the origin — it's what the row's coloured edge means — and the
 * rest follow in the order the workspace reports them. Falls back to the
 * origin alone for a conversation that reports no list.
 */
function channelsOf(c) {
  const all = c.channels?.length ? c.channels : [c.channel].filter(Boolean)
  return [c.channel, ...all.filter((x) => x && x !== c.channel)].filter(Boolean)
}

const ANY_AGENT = { id: 'all', name: 'All agents' }
/** Conversations whose workflow no longer exists still need to be reachable. */
const GONE_AGENT = { id: 'gone', name: 'Deleted or unknown agent' }

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

  // The rail renders the first `shown` matches. A new search or channel starts
  // from the top again — carrying a deep scroll across filters just hides the
  // best matches behind a button.
  const visible = filtered.slice(0, shown)
  const more = filtered.length - visible.length

  useEffect(() => {
    setShown(PAGE)
  }, [query, channel, agent])

  // A conversation opened by link — from the Dashboard, or a shared URL — can
  // sit past the loaded window. Load far enough for the rail to show where you
  // are, rather than highlighting a row that isn't there.
  useEffect(() => {
    const at = filtered.findIndex((c) => c.id === id)
    if (at >= PAGE) setShown((n) => Math.max(n, Math.ceil((at + 1) / PAGE) * PAGE))
  }, [id, filtered])

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

/* ── detail pane ──────────────────────────────────────────── */

function ConversationDetail({ conversation, onBack, onCalling }) {
  const [tab, setTab] = useState('overview')

  const loadMessages = useCallback(() => getMessages(conversation.id), [conversation.id])
  const thread = useResource(loadMessages, [], [conversation.id])

  // What this conversation's own agent can be reached on. One request, and the
  // Call button and the composer chips both read it.
  const loadReach = useCallback(() => getAgentReach(conversation.agentId), [conversation.agentId])
  const reach = useResource(loadReach, EMPTY_REACH, [conversation.agentId])

  const [confirmCall, setConfirmCall] = useState(false)
  const [calling, setCalling] = useState(false)
  const [callResult, setCallResult] = useState(null)

  const cannotCall = !conversation.phone
    ? 'No phone number on this conversation'
    : !conversation.agentId
      ? 'This conversation has no agent'
      : reach.status === 'loading'
        ? 'Checking whether this agent takes calls…'
        : !reach.data.channels.includes('Phone')
          ? `${conversation.agent ?? 'This agent'} has no phone trigger`
          : null

  async function placeCall() {
    setConfirmCall(false)
    setCalling(true)
    setCallResult(null)
    try {
      const r = await startOutbound({
        agentId: conversation.agentId,
        channel: 'phone',
        to: conversation.phone.replace(/[^\d+]/g, ''),
        customerId: conversation.customerId || undefined,
      })
      // A call opens its own conversation — it is a session, not this thread.
      setCallResult({ ok: true, id: r.conversationId, status: r.status })
      onCalling({
        name: conversation.title,
        phone: conversation.phone,
        conversationId: r.conversationId,
      })
    } catch (err) {
      setCallResult({ ok: false, text: err.message })
    } finally {
      setCalling(false)
    }
  }

  const ChannelIcon = channelIcon[conversation.channel] ?? IconChat
  const spoken = thread.data.filter((m) => m.role === 'customer' || m.role === 'agent')
  const call = callInfoOf(thread.data)

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Back to conversations"
              onClick={onBack}
              className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-muted-bg md:hidden"
            >
              <IconChevronLeft size={18} />
            </button>
            <Avatar name={conversation.name} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-sm font-semibold">{conversation.title}</span>
                {/* Every unnamed thread is titled "Anonymous", so the ref is
                    what tells this one from the next. */}
                {!conversation.name && conversation.ref && (
                  <span className="shrink-0 font-mono text-[11px] text-ink-4">{conversation.ref}</span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="muted" size="sm">
                  <ChannelIcon size={10} />
                  {conversation.channel}
                </Badge>
                {conversation.agent && (
                  <span className="truncate text-[11px] font-medium text-brand">
                    {conversation.agent}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={Boolean(cannotCall) || calling}
              title={cannotCall ?? `${conversation.agent} will phone ${conversation.phone}`}
              onClick={() => setConfirmCall(true)}
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
                cannotCall
                  ? 'cursor-not-allowed border-line bg-sunken text-ink-4'
                  : 'border-brand-line bg-brand-soft text-brand hover:border-brand hover:bg-brand hover:text-white',
              )}
            >
              {calling ? (
                <span
                  aria-hidden="true"
                  className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                />
              ) : (
                <IconPhone size={13} />
              )}
              {calling ? 'Calling…' : 'Call'}
            </button>
            <StatusBadge label={conversation.status} />
          </div>
        </header>

        <div className="shrink-0 border-b border-line bg-surface px-4 pt-3 sm:px-5">
          <Tabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'transcript', label: 'Transcript' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>

        {callResult && (
          <div
            role="status"
            className={cn(
              'flex items-start gap-2.5 border-b px-4 py-2.5 text-[11.5px] sm:px-5',
              callResult.ok ? 'border-ok/25 bg-ok-bg' : 'border-danger/25 bg-danger-bg',
            )}
          >
            <IconPhone size={14} className={cn('mt-0.5 shrink-0', callResult.ok ? 'text-ok' : 'text-danger')} />
            <p className="min-w-0 flex-1 leading-relaxed text-ink-2">
              {callResult.ok ? (
                <>
                  Calling {conversation.phone} — the call has its own conversation.{' '}
                  {callResult.id && (
                    <Link to={`/conversations/${callResult.id}`} className="font-medium text-brand hover:underline">
                      Open it
                    </Link>
                  )}
                </>
              ) : (
                callResult.text
              )}
            </p>
            <button
              type="button"
              onClick={() => setCallResult(null)}
              aria-label="Dismiss"
              className="shrink-0 text-ink-3 hover:text-ink"
            >
              <IconX size={13} />
            </button>
          </div>
        )}

        {tab === 'overview' ? (
          <OverviewTab conversation={conversation} thread={thread} spoken={spoken} call={call} />
        ) : (
          <TranscriptTab conversation={conversation} thread={thread} reach={reach} />
        )}
      </div>

      {/* A call reaches a real person, and the button sits one click from
          anything else in the header. */}
      <ConfirmDialog
        open={confirmCall}
        title="Place this call?"
        body={`${conversation.agent} will phone ${conversation.phone} now. The call opens its own conversation — a call is a session with its own recording, not a continuation of this thread.`}
        confirmLabel="Call now"
        onConfirm={placeCall}
        onCancel={() => setConfirmCall(false)}
      />
    </div>
  )
}

/* ── overview tab ─────────────────────────────────────────── */

function Section({ title, action, children }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[10.5px] font-semibold tracking-[0.07em] text-ink-3 uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  )
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-b-0">
      <span className="shrink-0 text-xs text-ink-3">{label}</span>
      <span className={cn('truncate text-right text-[12.5px]', mono && 'font-mono tabular-nums')}>
        {value || '—'}
      </span>
    </div>
  )
}

function OverviewTab({ conversation, thread, spoken, call }) {
  const download = (format) => {
    const lines = thread.data.map((m) =>
      m.role === 'tool' ? `[${m.text}]` : `${m.author} (${m.time}): ${m.text}`,
    )
    let body
    let type
    let ext
    if (format === 'json') {
      body = JSON.stringify({ conversation, messages: thread.data }, null, 2)
      type = 'application/json'
      ext = 'json'
    } else if (format === 'md') {
      body = `# ${conversation.title} · ${conversation.ref}\n\n_${conversation.preview}_\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`
      type = 'text/markdown'
      ext = 'md'
    } else {
      body = `${conversation.title} · ${conversation.ref}\n\n${lines.join('\n')}\n`
      type = 'text/plain'
      ext = 'txt'
    }
    const url = URL.createObjectURL(new Blob([body], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = `conversation-${String(conversation.id).slice(0, 8)}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-5">
      <Section title="Summary">
        <p className="text-[13px] leading-relaxed text-ink-2">
          {conversation.preview || 'No summary was generated for this conversation.'}
        </p>
      </Section>

      <Section title="Captured information">
        <div className="flex flex-col">
          <Row label="Phone" value={conversation.phone} mono />
          <Row label="Email" value={conversation.email} />
          <Row label="Customer" value={conversation.name} />
          <Row label="Customer ID" value={conversation.customerId} mono />
        </div>
      </Section>

      <Section title="Timeline">
        <div className="flex flex-col">
          <Row
            label="Started"
            value={conversation.createdAt ? new Date(conversation.createdAt).toLocaleString('en-GB') : null}
            mono
          />
          <Row
            label="Last activity"
            value={conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleString('en-GB') : null}
            mono
          />
          <Row
            label="Duration"
            value={call.duration ?? duration(conversation.createdAt, conversation.updatedAt)}
            mono
          />
          <Row
            label="Messages"
            value={thread.status === 'loading' ? '…' : String(spoken.length)}
            mono
          />
        </div>
      </Section>

      <Section
        title="Artifacts"
        action={
          <div className="flex gap-1.5">
            {['json', 'txt', 'md'].map((f) => (
              <Button
                key={f}
                size="sm"
                disabled={thread.status === 'loading' || thread.data.length === 0}
                onClick={() => download(f)}
              >
                <IconDownload size={12} />
                {f.toUpperCase()}
              </Button>
            ))}
          </div>
        }
      >
        {(call.hasRecording || conversation.channel === 'Phone') && (
          <div className="mb-4">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
              Call recording
            </p>
            <RecordingPlayer conversationId={conversation.id} />
          </div>
        )}
        <p className="text-xs leading-relaxed text-ink-3">
          Export the transcript as JSON, plain text or Markdown.
        </p>
      </Section>
    </div>
  )
}

/* ── transcript tab ───────────────────────────────────────── */

/**
 * A tool call in the thread. Collapsed it shows name + latency; expanded it
 * shows the real input/output the agent exchanged — the console's "Debug".
 */
function ToolEvent({ event }) {
  const hasIo = event.toolInput != null || event.toolOutput != null
  const pretty = (v) =>
    typeof v === 'string' ? v : JSON.stringify(v, null, 2)

  const head = (
    <>
      <IconSparkle size={10} className="shrink-0" />
      <span className="truncate font-mono">{event.toolName ?? event.eventType}</span>
      {event.toolLatencyMs != null && (
        <span className="shrink-0 font-mono text-ink-4">{event.toolLatencyMs} ms</span>
      )}
      {event.toolStatus && event.toolStatus !== 'ok' && (
        <span className="shrink-0 text-danger">{event.toolStatus}</span>
      )}
    </>
  )

  if (!hasIo) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 self-center rounded-full border border-line bg-sunken px-2.5 py-1 text-[10.5px] text-ink-3">
        {head}
      </span>
    )
  }

  return (
    <details className="w-full max-w-[90%] self-center rounded-lg border border-line bg-sunken">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] text-ink-3 hover:text-ink">
        {head}
        <IconChevronRight size={11} className="ml-auto shrink-0" />
      </summary>
      <div className="flex flex-col gap-2 border-t border-line px-2.5 py-2">
        {event.toolInput != null && (
          <div>
            <p className="mb-1 text-[9.5px] font-semibold tracking-[0.06em] text-ink-4 uppercase">Input</p>
            <pre className="max-h-40 overflow-auto rounded bg-surface p-2 font-mono text-[10.5px] whitespace-pre-wrap text-ink-2">
              {pretty(event.toolInput)}
            </pre>
          </div>
        )}
        {event.toolOutput != null && (
          <div>
            <p className="mb-1 text-[9.5px] font-semibold tracking-[0.06em] text-ink-4 uppercase">Output</p>
            <pre className="max-h-40 overflow-auto rounded bg-surface p-2 font-mono text-[10.5px] whitespace-pre-wrap text-ink-2">
              {pretty(event.toolOutput)}
            </pre>
          </div>
        )}
      </div>
    </details>
  )
}

/**
 * Message composer.
 *
 * The workspace exposes no send-message endpoint, so Send cannot actually
 * deliver anything yet. Rather than swallow the click and look like it worked,
 * it says so plainly and keeps the draft in the box.
 */
const COMPOSER_MAX_H = 140

/**
 * Channels the composer can send on.
 *
 * `needs` is the contact detail the message is addressed to; `label` doubles
 * as the name the agent's triggers and senders are reported under.
 */
const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: IconChat, needs: 'phone' },
  { id: 'email', label: 'Email', icon: IconMail, needs: 'email' },
  { id: 'sms', label: 'SMS', icon: IconSms, needs: 'phone' },
]

/** A channel chip. Picks the channel; it never sends on its own. */
function ChannelChip({ icon: Icon, label, selected, disabled, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed border-line bg-sunken text-ink-4'
          : selected
            ? 'border-brand bg-brand text-white'
            : 'border-line-strong bg-surface text-ink-2 hover:border-brand-line hover:bg-brand-soft hover:text-brand',
      )}
    >
      <Icon size={12} />
      {label}
    </button>
  )
}

/**
 * Message composer: type, pick a channel, then Send.
 *
 * Sends through POST /outbound as the conversation's own agent, which is what
 * continuing a thread means on a text channel. A chip is only usable when the
 * conversation has the contact detail AND the agent has a trigger for that
 * channel — the API rejects the rest, and a disabled chip that says why beats
 * a request that fails after you have typed a message.
 */
function Composer({ conversation, reach }) {
  const [draft, setDraft] = useState('')
  const [channel, setChannel] = useState(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const tel = conversation.phone ? conversation.phone.replace(/[^\d+]/g, '') : null
  const email = conversation.email || null
  const have = { phone: Boolean(tel), email: Boolean(email) }

  const ready = Boolean(draft.trim()) && Boolean(channel) && !sending

  /** Why this chip can't be used, or null when it can. */
  const blocked = (c) => {
    if (!have[c.needs]) {
      return `No ${c.needs === 'phone' ? 'phone number' : 'email address'} on this conversation`
    }
    if (!conversation.agentId) return 'This conversation has no agent'
    if (reach.status === 'loading') return 'Checking what this agent can send…'
    if (!reach.data.channels.includes(c.label)) {
      return `${conversation.agent ?? 'This agent'} has no ${c.label} trigger`
    }
    return null
  }

  const send = async () => {
    if (!ready) return
    setResult(null)
    setSending(true)
    try {
      const picked = CHANNELS.find((c) => c.id === channel)
      const r = await startOutbound({
        agentId: conversation.agentId,
        channel,
        to: picked.needs === 'phone' ? tel : email,
        openingMessage: draft.trim(),
        customerId: conversation.customerId || undefined,
      })
      // The request succeeded either way; whether anything left the building
      // is a separate question, and the one worth reporting.
      setResult(
        r.sendAuthorized
          ? { ok: true, text: `Sent on ${picked.label} to ${picked.needs === 'phone' ? tel : email}` }
          : {
              ok: false,
              text: `Conversation ran, but ${conversation.agent ?? 'this agent'} has no ${picked.label} sender action — nothing was sent.`,
            },
      )
      if (r.sendAuthorized) {
        setDraft('')
        setChannel(null)
      }
    } catch (err) {
      setResult({ ok: false, text: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-surface px-4 py-3 sm:px-5">
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {CHANNELS.map((c) => {
          const why = blocked(c)
          return (
            <ChannelChip
              key={c.id}
              icon={c.icon}
              label={c.label}
              selected={channel === c.id}
              disabled={Boolean(why)}
              title={why ?? `Send on ${c.label}`}
              onClick={() => {
                setChannel((prev) => (prev === c.id ? null : c.id))
                setResult(null)
              }}
            />
          )
        })}
      </div>

      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">
          Write a message
        </label>
        <textarea
          id="composer"
          rows={1}
          value={draft}
          placeholder="Write a message…"
          onChange={(e) => {
            setDraft(e.target.value)
            setResult(null)
            const el = e.target
            el.style.height = 'auto'
            const needed = el.scrollHeight
            el.style.height = `${Math.min(needed, COMPOSER_MAX_H)}px`
            el.style.overflowY = needed > COMPOSER_MAX_H ? 'auto' : 'hidden'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          style={{ maxHeight: COMPOSER_MAX_H, overflowY: 'hidden' }}
          className="min-h-10 flex-1 resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-4 focus:border-brand focus:outline-none"
        />
        <Button
          variant="primary"
          size="md"
          disabled={!ready}
          onClick={send}
          title={
            !draft.trim() ? 'Write a message first' : !channel ? 'Pick a channel first' : undefined
          }
        >
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>

      {result && (
        <p className={cn('mt-2 text-[11.5px]', result.ok ? 'text-ok' : 'text-danger')}>
          {result.text}
        </p>
      )}
    </div>
  )
}


function TranscriptTab({ conversation, thread, reach }) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 sm:p-5">
        {thread.status === 'loading' ? (
          <div className="flex flex-col gap-4">
            {[62, 48, 74, 40].map((w, i) => (
              <Skeleton
                key={i}
                className={cn('h-14', i % 2 ? 'self-start' : 'self-end')}
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        ) : thread.status === 'error' ? (
          <ErrorState error={thread.error} onRetry={thread.reload} />
        ) : thread.data.length === 0 ? (
          <EmptyState icon={IconChat} title="No messages" note="This conversation has no transcript events." />
        ) : (
          thread.data.map((m) =>
            m.role === 'tool' ? (
              <ToolEvent key={m.id} event={m} />
            ) : m.role === 'system' ? (
              <span
                key={m.id}
                className="inline-flex max-w-full items-center gap-1.5 self-center rounded-full border border-line bg-sunken px-2.5 py-1 text-[10.5px] text-ink-3"
              >
                <IconClock size={10} className="shrink-0" />
                <span className="truncate">
                  {m.eventType.replaceAll('_', ' ')}
                  {m.time && ` · ${m.time}`}
                </span>
              </span>
            ) : (
              /* Customer right in brand fill, agent left on surface — matching
                 the console, which is the inverse of a normal inbox. */
              <div
                key={m.id}
                className={cn(
                  'flex max-w-[82%] flex-col gap-1 sm:max-w-[68%]',
                  m.role === 'customer' ? 'items-end self-end' : 'items-start self-start',
                )}
              >
                <span className="px-1 text-[10.5px] font-medium text-ink-3">
                  {m.role === 'customer' ? conversation.name : `AI · ${conversation.agent ?? m.author}`}
                </span>
                <div
                  className={cn(
                    'px-3.5 py-2.5 text-[13px] leading-relaxed break-words',
                    m.role === 'customer'
                      ? 'rounded-[14px_14px_4px_14px] bg-brand text-white'
                      : 'rounded-[14px_14px_14px_4px] border border-line bg-surface text-ink',
                  )}
                >
                  {m.text}
                </div>
                <span className="px-1 text-[10px] text-ink-4">{m.time}</span>
              </div>
            ),
          )
        )}
      </div>
      <Composer conversation={conversation} reach={reach} />
    </>
  )
}

