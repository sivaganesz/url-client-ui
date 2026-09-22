import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import Avatar from '../components/ui/Avatar'
import Badge, { StatusBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Card, { ReservedPanel } from '../components/ui/Card'
import DataBanner from '../components/ui/DataBanner'
import RecordingPlayer from '../components/RecordingPlayer'
import { ChipGroup, SearchInput, Tabs } from '../components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import {
  IconAgent,
  IconAlert,
  IconChat,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDownload,
  IconMail,
  IconNote,
  IconPhone,
  IconPlus,
  IconSearch,
  IconSms,
  IconSparkle,
  channelIcon,
} from '../components/icons'
import { cn } from '../lib/cn'
import { useResource } from '../lib/useResource'
import { callInfoOf, duration, getConversations, getCustomer, getMessages, timeAgo } from '../lib/api'
import {
  conversations as sampleConversations,
  customerByConversation,
  messagesByConversation,
} from '../data/sample'

export default function Conversations() {
  const { openDrawer } = useOutletContext()
  const { id } = useParams()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState('All')

  const list = useResource(getConversations, sampleConversations, [])
  const conversations = list.data

  const channels = useMemo(
    () => ['All', ...Array.from(new Set(conversations.map((c) => c.channel).filter(Boolean)))],
    [conversations],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return conversations.filter(
      (c) =>
        (channel === 'All' || c.channel === channel) &&
        (q === '' ||
          [c.title, c.name, c.phone, c.email].filter(Boolean).join(' ').toLowerCase().includes(q)),
    )
  }, [conversations, query, channel])

  const selectedId = id ?? null
  const selected = conversations.find((c) => c.id === selectedId) ?? null

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── list rail ──────────────────────────────────────── */}
      <aside
        className={cn(
          'w-full shrink-0 flex-col border-r border-line bg-surface md:flex md:w-[19rem]',
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
          <Button variant="primary" size="md" className="shrink-0">
            <IconPlus size={14} />
            New
          </Button>
        </div>

        <div className="shrink-0 border-b border-line px-3 py-2.5">
          <ChipGroup label="Filter by channel" options={channels} value={channel} onChange={setChannel} />
        </div>

        {list.status !== 'live' && list.status !== 'loading' && (
          <div className="border-b border-line p-3">
            <DataBanner
              status={list.status}
              error={list.error}
              onRetry={list.reload}
              note="Showing bundled samples."
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
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={IconSearch}
              title="No matches"
              note={`Nothing matches “${query}”${channel !== 'All' ? ` on ${channel}` : ''}.`}
            />
          ) : (
            <ul>
              {filtered.map((c) => {
                const ChannelIcon = channelIcon[c.channel] ?? IconChat
                const active = c.id === selectedId
                return (
                  <li key={c.id}>
                    <Link
                      to={`/conversations/${c.id}`}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex gap-2.5 border-b border-line/70 px-3 py-2.5 transition-colors',
                        active
                          ? 'bg-brand-soft shadow-[inset_2px_0_0_var(--color-brand)]'
                          : 'hover:bg-sunken',
                      )}
                    >
                      <Avatar name={c.name} size="sm" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12.5px] font-semibold" title={c.title}>
                            {c.title}
                          </span>
                          <span className="shrink-0 text-[10.5px] text-ink-3">
                            {timeAgo(c.updatedAt ?? c.createdAt) || c.time}
                          </span>
                        </div>
                        <p className="truncate text-[11.5px] text-ink-3 italic">{c.preview}</p>
                        <div className="flex items-center gap-1.5">
                          <Badge tone="muted" size="sm">
                            <ChannelIcon size={10} />
                            {c.channel}
                          </Badge>
                          <StatusBadge label={c.status} size="sm" />
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-line px-3 py-2 text-center text-[11px] text-ink-3">
          {list.status === 'loading'
            ? 'Loading…'
            : `${filtered.length} of ${conversations.length} conversations`}
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
          />
        )}
      </section>
    </div>
  )
}

/* ── detail pane ──────────────────────────────────────────── */

function ConversationDetail({ conversation, onBack }) {
  const [tab, setTab] = useState('overview')
  // const [railOpen, setRailOpen] = useState(true) // parked with the profile rail

  const loadMessages = useCallback(() => getMessages(conversation.id), [conversation.id])
  const thread = useResource(
    loadMessages,
    messagesByConversation[conversation.id] ?? [],
    [conversation.id],
  )

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
              <span className="truncate text-sm font-semibold">{conversation.title}</span>
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
            {conversation.phone ? (
              <a
                href={`tel:${conversation.phone.replace(/[^\d+]/g, '')}`}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-brand-line bg-brand-soft px-3 text-[11.5px] font-medium text-brand transition-colors hover:border-brand hover:bg-brand hover:text-white"
              >
                <IconPhone size={13} />
                Call
              </a>
            ) : (
              <span
                aria-disabled="true"
                title="No phone number on this conversation"
                className="inline-flex h-7 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-full border border-line bg-sunken px-3 text-[11.5px] font-medium text-ink-4"
              >
                <IconPhone size={13} />
                Call
              </span>
            )}
            <StatusBadge label={conversation.status} />
            {/* Toggle for the customer profile rail — parked with it.
            <button
              type="button"
              onClick={() => setRailOpen((v) => !v)}
              aria-label={railOpen ? 'Hide customer panel' : 'Show customer panel'}
              aria-expanded={railOpen}
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-line-strong text-ink-2 hover:bg-sunken xl:flex"
            >
              {railOpen ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
            </button>
            */}
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

        {tab === 'overview' ? (
          <OverviewTab conversation={conversation} thread={thread} spoken={spoken} call={call} />
        ) : (
          <TranscriptTab conversation={conversation} thread={thread} />
        )}
      </div>

      {/* Customer profile rail — parked for now, not currently needed.
          To restore: uncomment this, the toggle button in the header above,
          and the railOpen state at the top of this component. The ProfileRail
          and ReachOut components below are left intact. */}
      {/* {railOpen && (
        <ProfileRail conversation={conversation} messageCount={spoken.length} />
      )} */}
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
      body = `# ${conversation.title}\n\n_${conversation.preview}_\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`
      type = 'text/markdown'
      ext = 'md'
    } else {
      body = `${conversation.title}\n\n${lines.join('\n')}\n`
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

/** Channels the composer can send on, and what each needs to be usable. */
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
 * Only WhatsApp has somewhere to go — it posts to /api/whatsapp, which relays
 * to the hook server-side so the hook URL never reaches the browser. Email and
 * SMS are selectable but say plainly that no endpoint exists rather than
 * silently doing nothing.
 */
function Composer({ conversation }) {
  const [draft, setDraft] = useState('')
  const [channel, setChannel] = useState(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const tel = conversation.phone ? conversation.phone.replace(/[^\d+]/g, '') : null
  const email = conversation.email || null
  const have = { phone: Boolean(tel), email: Boolean(email) }

  const ready = Boolean(draft.trim()) && Boolean(channel) && !sending

  const send = async () => {
    if (!ready) return
    setResult(null)

    if (channel !== 'whatsapp') {
      const name = CHANNELS.find((c) => c.id === channel).label
      setResult({ ok: false, text: `${name} sending isn't available yet — no endpoint exists for it.` })
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: tel, name: conversation.name ?? '', message: draft.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
      setResult({ ok: true, text: `Sent on WhatsApp to ${body?.phone ?? tel}` })
      setDraft('')
      setChannel(null)
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
          const usable = have[c.needs]
          return (
            <ChannelChip
              key={c.id}
              icon={c.icon}
              label={c.label}
              selected={channel === c.id}
              disabled={!usable}
              title={usable ? `Send on ${c.label}` : `No ${c.needs === 'phone' ? 'phone number' : 'email address'} on this conversation`}
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


function TranscriptTab({ conversation, thread }) {
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
      <Composer conversation={conversation} />
    </>
  )
}

/* ── profile rail ─────────────────────────────────────────── */

function ReachOut({ icon: Icon, label, href, disabled }) {
  const className = cn(
    'flex flex-1 flex-col items-center gap-1.5 rounded-lg border border-line py-2.5 text-[10.5px] font-medium transition-colors',
    disabled
      ? 'cursor-not-allowed bg-sunken text-ink-4'
      : 'bg-surface text-ink-2 hover:border-brand-line hover:bg-brand-soft hover:text-brand',
  )
  if (disabled) {
    return (
      <span className={className} aria-disabled="true">
        <Icon size={16} />
        {label}
      </span>
    )
  }
  return (
    <a href={href} className={className}>
      <Icon size={16} />
      {label}
    </a>
  )
}

function ProfileRail({ conversation, messageCount }) {
  const loadCustomer = useCallback(
    () => getCustomer(conversation.customerId),
    [conversation.customerId],
  )
  const { data: customer, status, error, reload } = useResource(
    loadCustomer,
    customerByConversation[conversation.id] ?? null,
    [conversation.customerId, conversation.id],
  )

  const phone = customer?.details?.find((d) => d.label === 'Phone')?.value
  const tel = phone && phone !== '—' ? phone.replace(/[^\d+]/g, '') : null
  const email = customer?.details?.find((d) => d.label === 'Email')?.value
  const mail = email && email !== '—' ? email : null

  return (
    <aside className="hidden w-[17.5rem] shrink-0 flex-col overflow-auto border-l border-line bg-surface xl:flex">
      {status === 'loading' ? (
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="mx-auto h-16 w-16 rounded-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : status === 'error' ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="flex flex-col items-center gap-2 border-b border-line px-4 py-5">
            <Avatar name={customer?.name ?? conversation.name} size="lg" />
            <span className="mt-1 max-w-full truncate text-[13px] font-semibold">
              {conversation.title}
            </span>
            <span className="text-[11px] text-ink-3">
              {customer ? 'Customer' : 'Anonymous session'}
            </span>
            <div className="mt-1 flex flex-wrap justify-center gap-1.5">
              <Badge tone="muted" size="sm">
                {conversation.channel}
              </Badge>
              <StatusBadge label={conversation.status} size="sm" />
            </div>
          </div>

          {customer && (
            <div className="border-b border-line px-4 py-3">
              {customer.details
                .filter((d) => d.value && d.value !== '—')
                .slice(0, 5)
                .map((d) => (
                  <Row key={d.label} label={d.label} value={d.value} mono={d.mono} />
                ))}
            </div>
          )}

          <div className="border-b border-line px-4 py-3">
            <h3 className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              Agent
            </h3>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <IconAgent size={14} />
              </span>
              <Link
                to="/agents"
                className="truncate text-[12.5px] font-medium hover:text-brand"
                title={conversation.agent ?? 'Unassigned'}
              >
                {conversation.agent ?? 'Unassigned'}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-b border-line px-4 py-3 text-center">
            {[
              { value: String(messageCount), label: 'Messages' },
              { value: String(conversation.channels?.length || 1), label: 'Channels' },
              { value: timeAgo(conversation.updatedAt ?? conversation.createdAt), label: 'Last seen' },
            ].map((s) => (
              <div key={s.label} className="flex flex-col gap-1 rounded-lg bg-sunken px-1 py-2">
                <span className="truncate font-mono text-[13px] font-semibold tabular-nums">
                  {s.value}
                </span>
                <span className="text-[9px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          <div className="px-4 py-3">
            <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              <IconClock size={11} />
              Reach out
            </h3>
            <div className="flex gap-1.5">
              <ReachOut icon={IconPhone} label="Call" href={`tel:${tel}`} disabled={!tel} />
              <ReachOut
                icon={IconChat}
                label="WhatsApp"
                href={`https://wa.me/${tel?.replace('+', '')}`}
                disabled={!tel}
              />
              <ReachOut icon={IconSms} label="SMS" href={`sms:${tel}`} disabled={!tel} />
              <ReachOut icon={IconMail} label="Email" href={`mailto:${mail}`} disabled={!mail} />
            </div>
          </div>

          <div className="mt-auto p-4">
            <ReservedPanel
              icon={IconNote}
              title="Debug · Runs · Recording"
              note="Reserved — this workspace’s API exposes no run traces, QA scores or call recordings."
            />
          </div>
        </>
      )}
    </aside>
  )
}
