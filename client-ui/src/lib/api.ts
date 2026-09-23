/**
 * Siva Workspace data access — REST.
 *
 * Everything goes through the same-origin backend (../backend), which resolves
 * the signed-in user's workspace and adds its Authorization header — so the
 * Perfox key never enters the browser bundle, and two users signed in at once
 * reach two different workspaces through these same URLs.
 *
 * REST, not MCP: MCP is a tool-calling protocol for LLM agents. A web frontend
 * belongs on plain HTTP resources. `/conversations/{id}/events` returns exactly
 * what `get_conversation_transcript` does, `include=tool_io` included, so
 * nothing is lost by using it.
 *
 * ROUTES IN USE (all verified to answer 200 with this key):
 *   GET /agents                      GET /customers
 *   GET /conversations               GET /customers/{id}
 *   GET /conversations/{id}/events   — the transcript; NOT /transcript
 *
 * Gotchas found by probing, since none of this is documented:
 *   · An unknown path answers 401 "Invalid or expired token", not 404 — it
 *     reads like an auth failure but means the route doesn't exist.
 *   · The transcript lives at /events. /transcript and /messages both 401.
 *   · limit/offset are ignored on /conversations — it always returns one page.
 *   · /analytics/summary, /calls and /conversations/{id}/recordings went live
 *     in Sept 2026 — real totals, token usage and call audio. Phone numbers
 *     are still the only missing resource.
 */

import type {
  Agent,
  AgentReach,
  Analytics,
  ApiAgent,
  ApiAnalytics,
  ApiCall,
  ApiConversation,
  ApiCredits,
  ApiCustomer,
  ApiList,
  ApiOutboundResult,
  ApiOverTimePoint,
  ApiRecordings,
  Call,
  ChannelLabel,
  Conversation,
  Credits,
  Message,
  OutboundRequest,
  OutboundResult,
  Recordings,
  SeriesPoint,
  StatusLabel,
  Summary,
  PhoneNumber,
} from './types'

const CHANNEL_LABELS: Record<string, string> = {
  web: 'Web',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  mobile: 'Mobile',
  web_voice: 'Web voice',
  heartbeat: 'Heartbeat',
}

const STATUS_LABELS: Record<string, string> = {
  resolved: 'Resolved',
  ended: 'Ended',
  abandoned: 'Abandoned',
  active: 'Active',
  running: 'Active',
  failed: 'Failed',
  published: 'Active',
  draft: 'Draft',
  archived: 'Paused',
}

const title = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
export const channelLabel = (c?: string): ChannelLabel =>
  (c ? (CHANNEL_LABELS[c] ?? title(c)) : undefined) ?? 'Unknown'
export const statusLabel = (s?: string): StatusLabel =>
  (s ? (STATUS_LABELS[s] ?? title(s)) : undefined) ?? 'Unknown'

/** Resources this workspace has no endpoint for. Pages read this to explain themselves. */
export const UNAVAILABLE = {
  calls:
    'This workspace has no call-log resource — no tool or REST route returns call records, so direction, numbers, duration, cost, recording and sentiment have nowhere to come from.',
  phoneNumbers:
    'This workspace has no phone-number resource — connected numbers aren’t exposed over MCP or REST.',
  analytics:
    'This workspace has no analytics resource — resolution rate and credit usage aren’t exposed. The figures below are derived from conversation records where that’s possible, and sampled where it isn’t.',
}

/**
 * Failures come back three ways: a string `error`, an object `error` carrying
 * validation detail, or a separate `message`. Pull whatever is there into one
 * readable line — "[object Object]" in a banner helps nobody.
 */
function messageOf(body: unknown): string | null {
  if (!body) return null
  const { error, message } = body as { error?: unknown; message?: unknown }
  const parts = [
    typeof error === 'string' ? error : error ? JSON.stringify(error) : null,
    typeof message === 'string' ? message : null,
  ].filter(Boolean)
  return [...new Set(parts)].join(' — ') || null
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  if (!res.ok) throw new Error(messageOf(body) ?? `HTTP ${res.status} from ${path}`)
  return body as T
}

export const health = () => request('/api/health')
export const discover = () => request('/api/discover')

/**
 * Reads already in flight, keyed by URL.
 *
 * Loaders compose — getSummary calls getConversations, which itself reads
 * conversations, customers and agents, while getAgents reads agents again —
 * so one page load asked for the same URL up to three times in the same tick.
 * Sharing the promise collapses those to one request without any page having
 * to know what the others are doing.
 *
 * Only in-flight, deliberately: an entry is dropped the moment it settles, so
 * this dedupes concurrent reads and never serves a stale response. Caching
 * across navigations is a different decision, with staleness to answer for.
 */
interface InFlight<T> {
  controller: AbortController
  waiting: number
  promise: Promise<T>
}

const inFlight = new Map<string, InFlight<unknown>>()

/**
 * `waiting` counts the callers still interested. A caller that aborts drops
 * its claim, and the underlying request is only cancelled when the last one
 * lets go — otherwise one component unmounting would cancel a request another
 * is still waiting on.
 */
function sharedGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  let entry = inFlight.get(url) as InFlight<T> | undefined

  if (!entry) {
    const controller = new AbortController()
    entry = { controller, waiting: 0, promise: request<T>(url, { signal: controller.signal }) }
    inFlight.set(url, entry)
    // Settled entries are never reused; the catch keeps this bookkeeping from
    // surfacing as an unhandled rejection.
    entry.promise.catch(() => {}).then(() => inFlight.delete(url))
  }

  entry.waiting += 1

  let released = false
  const release = (abort: boolean) => {
    if (released) return
    released = true
    entry.waiting -= 1
    if (abort && entry.waiting === 0) entry.controller.abort()
  }

  const onAbort = () => release(true)
  signal?.addEventListener('abort', onAbort, { once: true })

  const settle = () => {
    release(false)
    signal?.removeEventListener('abort', onAbort)
  }

  return entry.promise.then(
    (value: T) => {
      settle()
      return value
    },
    (err: unknown) => {
      settle()
      throw err
    },
  )
}

/**
 * GET a workspace resource. `path` is relative to the API base, e.g.
 * 'conversations' or `conversations/${id}/events`.
 *
 * `signal` is optional and threaded from the calling hook, so a component that
 * unmounts or refetches stops waiting on the old request.
 */
function rest<T = unknown>(
  path: string,
  params?: Record<string, string | number> | undefined,
  signal?: AbortSignal,
): Promise<T> {
  const qs = params ? `?${new URLSearchParams(params as Record<string, string>)}` : ''
  return sharedGet<T>(`/api/perfox/${path}${qs}`, signal)
}

/**
 * Every page of a cursor-paginated resource.
 *
 * The workspace caps a single response and returns `next_cursor` when more
 * records exist — `offset` and `page` are ignored. Reading one page and then
 * paginating the browser over it would silently hide everything past the cap,
 * so follow the cursor to the end. `max` stops a bad cursor spinning forever.
 */
async function restAll<T>(
  path: string,
  params?: Record<string, string | number>,
  signal?: AbortSignal,
  max = 20,
): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  for (let page = 0; page < max; page++) {
    const q: Record<string, string | number> = { ...params, ...(cursor ? { cursor } : null) }
    const body = await rest<ApiList<T>>(path, Object.keys(q).length ? q : undefined, signal)
    out.push(...rows<T>(body))
    cursor = body?.next_cursor ?? null
    if (!cursor) break
  }
  return out
}

/** A write against the workspace. Kept separate so reads stay obviously safe. */
function write<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  return request(`/api/perfox/${path}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Taking an agent live and standing it down are two different operations.
 *
 * PATCH accepts only draft | testing | archived | paused — "published" is
 * rejected, because going live runs validation and is its own endpoint.
 */
export const activateAgent = (id: string) => write(`agents/${id}/publish`, 'POST', {})
export const deactivateAgent = (id: string) => write(`agents/${id}`, 'PATCH', { status: 'paused' })

/**
 * What one agent can be reached on, and reply on.
 *
 * Same rule as getAgentsWithChannels, for the cases that already know which
 * agent they mean — a conversation knows its own, and reading fourteen graphs
 * to learn about one would be silly.
 */
export async function getAgentReach(agentId?: string, signal?: AbortSignal): Promise<AgentReach> {
  if (!agentId) return { channels: [], senders: [] }
  const a = await rest<ApiAgent | { data: ApiAgent }>(`agents/${agentId}`, undefined, signal).then(
    (r) => ('data' in r ? r.data : r),
  )
  const nodes = a?.nodes ?? []
  return {
    published: a?.status === 'published',
    channels: [
      ...new Set(
        nodes
          .filter((n) => n.type === 'trigger' && n.config?.channel)
          .map((n) => channelLabel(n.config?.channel)),
      ),
    ],
    senders: [
      ...new Set(
        nodes
          .map((n) => /^(.+)_sender$/.exec(n.type)?.[1])
          .filter(Boolean)
          .map(channelLabel),
      ),
    ],
  }
}

/**
 * Have an agent reach out first.
 *
 * A phone call always opens a new conversation — a call is a session with its
 * own beginning, end and recording, not a thread. SMS, WhatsApp and email
 * continue an open thread instead, which is what replying on those channels
 * means. Either way the customer is resolved from `to`, so history follows the
 * person; pass `customerId` only to skip that lookup.
 *
 * `send_authorized: false` is not a failure. The conversation started and the
 * agent ran — it simply has no Sender action for the channel, so nothing left
 * the building. Read it as "this agent isn't finished yet". Calls are always
 * authorized, because the voice stream is itself the delivery.
 */
export async function startOutbound({
  agentId,
  channel,
  to,
  openingMessage,
  customerId,
}: OutboundRequest): Promise<OutboundResult> {
  const body: Record<string, string> = { agent_id: agentId, channel, to }
  if (openingMessage) body.opening_message = openingMessage
  if (customerId) body.customer_id = customerId

  const r = await write<ApiOutboundResult>('outbound', 'POST', body)
  return {
    conversationId: r?.conversation_id ?? null,
    executionId: r?.execution_id ?? null,
    status: r?.status ?? null,
    channel: r?.channel ?? channel,
    // Absent means authorized: only the text channels can withhold it.
    sendAuthorized: r?.send_authorized !== false,
  }
}

export class UnavailableError extends Error {
  /** Read by useResource to tell "no endpoint yet" from "the request failed". */
  readonly notMapped = true

  constructor(resource: keyof typeof UNAVAILABLE) {
    super(UNAVAILABLE[resource] ?? `No live source for ${resource}.`)
    this.name = 'UnavailableError'
  }
}

const rows = <T,>(r: unknown): T[] => {
  if (Array.isArray(r)) return r as T[]
  const data = (r as { data?: unknown } | null)?.data
  return Array.isArray(data) ? (data as T[]) : []
}

/** "2026-09-17T08:35:50Z" -> "08:35" today, "Tue" this week, else "17 Sep". */
export function shortWhen(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const days = (now.getTime() - d.getTime()) / 86_400_000
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export const clockOf = (iso?: string): string =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

// ── loaders ──────────────────────────────────────────────────────────────

const mapAgent = (a: ApiAgent): Agent => ({
  id: a.id,
  name: a.name || 'Untitled agent',
  model: `v${a.active_version ?? 1} · ${a.node_count ?? 0} nodes`,
  status: statusLabel(a.status),
  channels: (a.channels ?? []).map(channelLabel),
  description: a.description?.trim() || 'No description set for this agent.',
  conversations: null, // not returned by list_agents; joined from conversations
  resolution: null,
  updatedAt: a.updated_at,
})

export async function getAgents(signal?: AbortSignal): Promise<Agent[]> {
  return rows<ApiAgent>(await rest('agents', undefined, signal)).map(mapAgent)
}

/**
 * Agents with the channels they can actually be reached on.
 *
 * The list endpoint reports `channels: ["web"]` for every agent, so it can't
 * be used to decide what an agent handles. The truth is in the graph: a
 * trigger node's `config.channel` names the channel that starts a
 * conversation, and an agent without one for a channel cannot be reached on it.
 *
 * That costs one detail request per agent, which is why this is separate from
 * getAgents() — only the callers that need it pay for it.
 */
export async function getAgentsWithChannels(): Promise<Agent[]> {
  const list = rows<ApiAgent>(await rest('agents'))
  const graphs = await Promise.all(
    list.map((a) =>
      rest<ApiAgent | { data: ApiAgent }>(`agents/${a.id}`)
        .then((r) => ('data' in r ? r.data : r))
        .catch(() => null),
    ),
  )

  return list.map((a, i): Agent => {
    const nodes = graphs[i]?.nodes ?? []
    return {
      ...mapAgent(a),
      channels: [
        ...new Set(
          nodes
            .filter((n) => n.type === 'trigger' && n.config?.channel)
            .map((n) => channelLabel(n.config?.channel)),
        ),
      ],
      // Sender actions — "whatsapp_sender" and friends. A text channel with a
      // trigger but no sender starts a conversation that can never reply, and
      // the API only reports that after the fact, via send_authorized.
      senders: [
        ...new Set(
          nodes
            .map((n) => /^(.+)_sender$/.exec(n.type)?.[1])
            .filter((x): x is string => Boolean(x))
            .map(channelLabel),
        ),
      ],
    }
  })
}

/**
 * Conversations joined to customers — list_conversations returns a customer_id
 * but no name, and the list view is unreadable without one.
 */
export async function getConversations(signal?: AbortSignal): Promise<Conversation[]> {
  const [convoRes, custRes, agentRes] = await Promise.all([
    rest('conversations', undefined, signal),
    rest('customers', undefined, signal).catch(() => ({ data: [] })),
    rest('agents', undefined, signal).catch(() => ({ data: [] })),
  ])

  const byId = new Map(rows<ApiCustomer>(custRes).map((c) => [c.id, c]))
  const agentById = new Map(rows<ApiAgent>(agentRes).map((a) => [a.id, a.name]))

  return rows<ApiConversation>(convoRes).map((c): Conversation => {
    const customer = c.customer_id ? byId.get(c.customer_id) : undefined
    // Two thirds of web sessions have no customer record at all. Heading those
    // rows with a raw hex id reads as noise, so the title says what the thread
    // is — Anonymous — and `ref` carries the id separately, for the places that
    // need to tell two of them apart.
    const ref = String(c.id).slice(0, 8)
    return {
      id: c.id,
      ref,
      customerId: c.customer_id,
      agentId: c.workflow_id,
      agent: (c.workflow_id ? agentById.get(c.workflow_id) : null) ?? null,
      title: customer?.name || customer?.phone || 'Anonymous',
      name: customer?.name || null,
      phone: customer?.phone || '',
      email: customer?.email || '',
      channel: channelLabel(c.channel_started ?? c.channels?.[0]),
      channels: (c.channels ?? []).map(channelLabel),
      status: statusLabel(c.status),
      preview: c.summary?.trim() || 'No summary available.',
      time: shortWhen(c.updated_at ?? c.created_at),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      unread: 0,
    }
  })
}

/** "5h ago" / "3d ago" — the list's relative stamp. */
export function timeAgo(iso?: string): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Wall-clock span between two ISO stamps, e.g. "1m 47s". */
export function duration(fromIso?: string, toIso?: string): string | null {
  if (!fromIso || !toIso) return '—'
  const secs = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000))
  if (!Number.isFinite(secs)) return '—'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/**
 * Transcript events -> the message shape the thread renders.
 *
 * Served by GET /conversations/{id}/events. `include=tool_io` is opt-in and off
 * by default, which is why a first look shows only
 * {id,event_type,actor,channel,created_at,text}; with it, tool events also carry
 * tool_name / tool_input / tool_output / tool_status / tool_latency_ms — the
 * console's "Debug" affordance.
 *
 * Event types seen on phone calls: user_message, ai_response, tool_call,
 * tool_result, call_started, call_ended, call_recorded, status_change,
 * identity_resolved.
 */
export async function getMessages(conversationId: string, signal?: AbortSignal): Promise<Message[]> {
  const res = await rest<ApiList<Record<string, unknown>>>(`conversations/${conversationId}/events`, {
    limit: 1000,
    include: 'tool_io,files',
  }, signal)
  return rows<Record<string, any>>(res).map((e): Message => {
    const isUser = e.event_type === 'user_message' || e.actor === 'user'
    const isAi = e.event_type === 'ai_response' || e.actor === 'ai'
    const isTool = e.event_type === 'tool_call' || e.event_type === 'tool_result'
    return {
      id: e.id,
      eventType: e.event_type,
      role: isUser ? 'customer' : isAi ? 'agent' : isTool ? 'tool' : 'system',
      author: isUser ? 'Customer' : isAi ? 'AI Agent' : 'System',
      time: clockOf(e.created_at),
      at: e.created_at,
      text: e.text?.trim() || '',
      toolName: e.tool_name ?? null,
      toolStatus: e.tool_status ?? null,
      toolLatencyMs: e.tool_latency_ms ?? null,
      toolInput: e.tool_input ?? null,
      toolOutput: e.tool_output ?? null,
    }
  })
}

/**
 * Call-level facts derived from the transcript's system events.
 *
 * `call_recorded` tells us a recording EXISTS, but the API returns no url,
 * filename or length on it under any `include` mode, and there is no REST
 * route for it either — so the UI reports the recording as present and
 * unreachable rather than pretending it isn't there.
 */
export function callInfoOf(events: Message[] = []) {
  const at = (type: string) => events.find((e) => e.eventType === type)?.at ?? null
  const started = at('call_started')
  const ended = at('call_ended')
  const recordedAt = at('call_recorded')
  return {
    isCall: Boolean(started || ended || recordedAt),
    started,
    ended,
    recordedAt,
    hasRecording: Boolean(recordedAt),
    recordingReachable: false, // no url is ever returned by this API
    duration: started && ended ? duration(started, ended) : null,
  }
}

export async function getCustomer(customerId?: string) {
  if (!customerId) return null
  const res = await rest<ApiCustomer | { data: ApiCustomer }>(`customers/${customerId}`)
  const c = (res && 'data' in res ? res.data : res) as (ApiCustomer & Record<string, any>) | undefined
  if (!c?.id) return null
  return {
    id: c.id,
    name: c.name || 'Anonymous',
    since: c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—',
    tags: c.tags ?? [],
    details: [
      { label: 'Customer ID', value: c.id, mono: true },
      { label: 'Full name', value: c.name || '—' },
      { label: 'Phone', value: c.phone || '—', mono: true },
      { label: 'Email', value: c.email || '—' },
      { label: 'External ID', value: c.external_id || '—', mono: true },
      { label: 'Language', value: c.preferred_language || '—' },
      { label: 'Created', value: c.created_at ? new Date(c.created_at).toLocaleString('en-GB') : '—', mono: true },
      { label: 'Updated', value: c.updated_at ? new Date(c.updated_at).toLocaleString('en-GB') : '—', mono: true },
    ],
    // Not exposed by the workspace; the page hides rather than invents these.
    stats: null,
    sentiment: null,
    lastContacted: c.updated_at ? new Date(c.updated_at).toLocaleString('en-GB') : null,
  }
}

/** Dashboard/Analytics figures derived from the records that do exist. */
/**
 * Signed recording URLs for a call, one per leg (caller / ai / combined).
 *
 * The links expire — the response says how soon, 900s at present — so they are
 * fetched when the player is opened rather than with the conversation, and can
 * be re-fetched when they lapse.
 */
export async function getRecordings(conversationId: string): Promise<Recordings> {
  const res = await rest<ApiRecordings>(`conversations/${conversationId}/recordings`)
  const legs = Array.isArray(res?.recordings) ? res.recordings : []
  const LABEL: Record<string, string> = {
    combined: 'Full call',
    caller: 'Customer only',
    ai: 'Assistant only',
  }
  return {
    expiresInSeconds: res?.expires_in_seconds ?? null,
    fetchedAt: Date.now(),
    // Combined first — it is what someone almost always wants to hear.
    legs: legs
      .map((r) => ({ leg: r.leg, label: LABEL[r.leg] ?? r.leg, url: r.url }))
      .sort((a, b) => (a.leg === 'combined' ? -1 : b.leg === 'combined' ? 1 : 0)),
  }
}

/**
 * Figures from the analytics endpoint.
 *
 * Pass { from, to } as YYYY-MM-DD to scope it; omit for all time. The endpoint
 * reports resolution_rate as a percentage (13.78), not a fraction.
 */
export async function getAnalytics(
  window?: { from?: string; to?: string },
  signal?: AbortSignal,
): Promise<Analytics> {
  const params =
    window?.from && window?.to ? { start_date: window.from, end_date: window.to } : undefined
  const a = await rest<ApiAnalytics>('analytics/summary', params, signal)
  const c = a?.conversations ?? {}
  const t = a?.tokens ?? {}
  return {
    total: c.total ?? null,
    active: c.active ?? null,
    resolved: c.resolved ?? null,
    escalated: c.escalated ?? null,
    abandoned: c.abandoned ?? null,
    // The API reports this as a percentage (13.78), not a fraction.
    resolutionRate: typeof c.resolution_rate === 'number' ? c.resolution_rate / 100 : null,
    window: a?.window ?? null,
    tokensIn: t.input ?? null,
    tokensOut: t.output ?? null,
    tokensTotal: t.total ?? null,
    llmCalls: t.llm_calls ?? null,
    channels: (a?.channels ?? []).map((x) => ({
      channel: channelLabel(x.channel),
      count: x.count,
    })),
  }
}

export async function getSummary(signal?: AbortSignal): Promise<Summary> {
  // Totals come from the analytics endpoint (authoritative, covers everything);
  // the per-day series still has to be derived, since nothing returns it.
  const [convos, agents, analytics] = await Promise.all([
    getConversations(signal),
    getAgents(signal),
    getAnalytics(undefined, signal).catch(() => null),
  ])

  const byChannel = new Map()
  for (const c of convos) byChannel.set(c.channel, (byChannel.get(c.channel) ?? 0) + 1)

  // Conversations per day for the last 7 days, oldest first.
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    days.push({ key: d.toDateString(), label: d.toLocaleDateString('en-GB', { weekday: 'short' }), value: 0 })
  }
  const slot = new Map(days.map((d) => [d.key, d]))
  for (const c of convos) {
    const hit = c.createdAt ? slot.get(new Date(c.createdAt).toDateString()) : undefined
    if (hit) hit.value += 1
  }

  // The workspace reports a literal 'resolved' status alongside 'ended' and
  // 'abandoned'. Resolution rate = resolved / everything that reached a
  // terminal state; 'ended' is NOT counted as resolved, since a call that
  // simply ended isn't the same as one that got what it came for.
  const TERMINAL = new Set(['Resolved', 'Ended', 'Abandoned'])
  const resolved = convos.filter((c) => c.status === 'Resolved').length
  const closable = convos.filter((c) => TERMINAL.has(c.status)).length

  return {
    analytics,
    totalConversations: analytics?.total ?? convos.length,
    totalAgents: agents.length,
    activeAgents: agents.filter((a) => a.status === 'Active').length,
    pausedAgents: agents.filter((a) => a.status !== 'Active').length,
    // From analytics where available: the conversations list is capped at one
    // page, so counting it under-reports once the workspace passes 200.
    phoneConversations:
      analytics?.channels?.find((x) => x.channel === 'Phone')?.count ??
      convos.filter((c) => c.channel === 'Phone').length,
    whatsappConversations:
      analytics?.channels?.find((x) => x.channel === 'WhatsApp')?.count ??
      convos.filter((c) => c.channel === 'WhatsApp').length,
    webConversations:
      analytics?.channels?.find((x) => x.channel === 'Web')?.count ??
      convos.filter((c) => c.channel === 'Web').length,
    // "Ended" vs "ended or abandoned" is the closest thing to a resolution rate
    // the data supports. Confirm the intended definition before trusting it.
    resolutionRate: analytics?.resolutionRate ?? (closable > 0 ? resolved / closable : null),
    channelSplit:
      analytics?.channels?.length
        ? [...analytics.channels].sort((a, b) => b.count - a.count)
        : [...byChannel.entries()]
            .map(([channel, count]) => ({ channel, count }))
            .sort((a, b) => b.count - a.count),
    volumeSeries: days.map(({ label, value }) => ({ label, value })),
  }
}

/**
 * Call history.
 *
 * Two fields carry caveats from the API team, so neither is surfaced as fact:
 *   · direction is always "unknown" — it isn't recorded against a call, and a
 *     guessed direction is worse than a blank, so the column is omitted
 *   · has_recording flips to false once a recording passes the workspace's
 *     retention window, so it means "available now", not "was ever recorded"
 */
const DAY_MS = 864e5
const WEEK_MS = 7 * DAY_MS
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })

/** Monday of the ISO week a date falls in. */
function monday(d: Date): Date {
  const m = new Date(d)
  m.setUTCDate(m.getUTCDate() - ((m.getUTCDay() + 6) % 7))
  return m
}

/** The ISO week label — "2026-W39" — a date falls in. */
function isoWeek(d: Date): string {
  // Thursday decides the year: a week belongs to whichever year holds it.
  const thu = new Date(d)
  thu.setUTCDate(thu.getUTCDate() - ((thu.getUTCDay() + 6) % 7) + 3)
  const year = thu.getUTCFullYear()
  const firstThu = new Date(Date.UTC(year, 0, 4))
  firstThu.setUTCDate(firstThu.getUTCDate() - ((firstThu.getUTCDay() + 6) % 7) + 3)
  return `${year}-W${String(1 + Math.round((thu.getTime() - firstThu.getTime()) / WEEK_MS)).padStart(2, '0')}`
}

/**
 * One bucket size, three jobs: name a bucket, walk to the next, and label it.
 *
 * The endpoint returns a different `date` format per interval — 2026-09-22,
 * 2026-W39, 2026-09 — so each needs its own reading and its own step.
 */
interface Bucket {
  /** Read a bucket key back into the date it starts on. */
  parse: (key: string) => Date
  /** Snap a plain yyyy-mm-dd to the start of the bucket containing it. */
  start: (iso: string) => Date
  key: (d: Date) => string
  next: (d: Date) => void
  label: (d: Date) => string
}

const INTERVALS: Record<string, Bucket> = {
  day: {
    parse: (key) => new Date(`${key}T00:00:00Z`),
    start: (iso) => new Date(`${iso}T00:00:00Z`),
    key: (d) => d.toISOString().slice(0, 10),
    next: (d) => d.setUTCDate(d.getUTCDate() + 1),
    label: (d) => fmt(d, { day: 'numeric', month: 'short' }),
  },
  week: {
    parse: (key) => {
      // "2026-W39". A malformed key would otherwise produce an Invalid Date
      // that silently poisons the whole series.
      const [y, w] = key.split('-W').map(Number)
      if (!Number.isFinite(y) || !Number.isFinite(w)) return new Date(NaN)
      const first = monday(new Date(Date.UTC(y as number, 0, 4)))
      first.setUTCDate(first.getUTCDate() + ((w as number) - 1) * 7)
      return first
    },
    start: (iso) => monday(new Date(`${iso}T00:00:00Z`)),
    key: isoWeek,
    next: (d) => d.setUTCDate(d.getUTCDate() + 7),
    label: (d) => `w/c ${fmt(d, { day: 'numeric', month: 'short' })}`,
  },
  month: {
    parse: (key) => new Date(`${key}-01T00:00:00Z`),
    start: (iso) => new Date(`${iso.slice(0, 7)}-01T00:00:00Z`),
    key: (d) => d.toISOString().slice(0, 7),
    next: (d) => d.setUTCMonth(d.getUTCMonth() + 1),
    label: (d) => fmt(d, { month: 'short', year: 'numeric' }),
  },
}

/** Enough for two years of daily buckets; a stop, not a limit anyone will meet. */
const MAX_BUCKETS = 800

/**
 * Conversations created per interval.
 *
 * The endpoint omits buckets that had none, so the raw series would draw 17
 * July next to 20 July and flatten a three-day gap into a single step. Fill
 * the calendar back in at zero before anything charts it — and when an
 * explicit range is asked for, fill from that range rather than from the
 * first bucket with data, so a quiet start reads as quiet rather than absent.
 *
 * Parameters: `interval` (day | week | month), `start_date`, `end_date`.
 * `from`/`to` are ignored here, unlike analytics/summary.
 */
/**
 * Credit balance.
 *
 * `balance_mc` is the same figure in millicredits — the integer the billing
 * system holds — so read that and divide rather than trusting the decimal to
 * survive the round trip intact.
 *
 * The two flags are the workspace's own judgement of when a balance is low,
 * so the threshold lives there rather than being guessed at here.
 */
export async function getCredits(signal?: AbortSignal): Promise<Credits> {
  const r = await rest<ApiCredits>('billing/credits', undefined, signal)
  const mc = r?.balance_mc
  return {
    balance: typeof mc === 'number' ? mc / 1000 : (r?.balance ?? null),
    low: Boolean(r?.low_balance),
    out: Boolean(r?.out_of_credits),
  }
}

export async function getConversationsOverTime(
  { interval = 'day', start_date, end_date }: { interval?: string; start_date?: string; end_date?: string } = {},
  signal?: AbortSignal,
): Promise<SeriesPoint[]> {
  const step = INTERVALS[interval] ?? INTERVALS.day!
  const query: Record<string, string> = { interval }
  if (start_date) query.start_date = start_date
  if (end_date) query.end_date = end_date

  const list = rows<ApiOverTimePoint>(await rest('analytics/conversations-over-time', query, signal))
  if (!list.length && !(start_date && end_date)) return []

  const byKey = new Map(list.map((d) => [d.date, d]))
  const first = list[0]
  const final = list.at(-1)
  const cursor = start_date ? step.start(start_date) : step.parse(first!.date)
  const last = end_date ? step.start(end_date) : step.parse(final!.date)
  const out: SeriesPoint[] = []

  while (cursor <= last && out.length < MAX_BUCKETS) {
    const key = step.key(cursor)
    const hit = byKey.get(key)
    out.push({
      date: key,
      label: step.label(cursor),
      value: hit?.count ?? 0,
      resolved: hit?.resolved ?? 0,
    })
    step.next(cursor)
  }
  return out
}

export async function getCalls(signal?: AbortSignal): Promise<Call[]> {
  const list = await restAll<ApiCall>('calls', undefined, signal)
  return list.map((c) => ({
    id: c.conversation_id,
    customerId: c.customer_id,
    name: c.end_user?.name || null,
    phone: c.end_user?.phone || null,
    channel: channelLabel(c.channel),
    status: statusLabel(c.status),
    summary: c.summary?.trim() || null,
    startedAt: c.started_at,
    endedAt: c.ended_at,
    durationSeconds: typeof c.duration_seconds === 'number' ? c.duration_seconds : null,
    hasRecording: Boolean(c.has_recording),
  }))
}

/** Seconds to a readable span: 8 -> "8s", 147 -> "2m 27s". */
export function spoken(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
export const getPhoneNumbers = (): Promise<PhoneNumber[]> =>
  Promise.reject(new UnavailableError('phoneNumbers'))
