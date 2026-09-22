/**
 * Siva Workspace data access — REST.
 *
 * Everything goes through the same-origin proxy (server/index.js), which adds
 * the Authorization header, so the Perfox key never enters the browser bundle.
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

const CHANNEL_LABELS = {
  web: 'Web',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  mobile: 'Mobile',
  web_voice: 'Web voice',
  heartbeat: 'Heartbeat',
}

const STATUS_LABELS = {
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

const title = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
export const channelLabel = (c) => CHANNEL_LABELS[c] ?? title(c) ?? 'Unknown'
export const statusLabel = (s) => STATUS_LABELS[s] ?? title(s) ?? 'Unknown'

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
function messageOf(body) {
  if (!body) return null
  const { error, message } = body
  const parts = [
    typeof error === 'string' ? error : error ? JSON.stringify(error) : null,
    typeof message === 'string' ? message : null,
  ].filter(Boolean)
  return [...new Set(parts)].join(' — ') || null
}

async function request(path, options = {}) {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  if (!res.ok) throw new Error(messageOf(body) ?? `HTTP ${res.status} from ${path}`)
  return body
}

export const health = () => request('/api/health')
export const discover = () => request('/api/discover')

/**
 * GET a workspace resource. `path` is relative to the API base, e.g.
 * 'conversations' or `conversations/${id}/events`.
 */
function rest(path, params) {
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  return request(`/api/perfox/${path}${qs}`)
}

/** A write against the workspace. Kept separate so reads stay obviously safe. */
function write(path, method, body) {
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
export const activateAgent = (id) => write(`agents/${id}/publish`, 'POST', {})
export const deactivateAgent = (id) => write(`agents/${id}`, 'PATCH', { status: 'paused' })

export class UnavailableError extends Error {
  constructor(resource) {
    super(UNAVAILABLE[resource] ?? `No live source for ${resource}.`)
    this.name = 'UnavailableError'
    this.notMapped = true
  }
}

const rows = (r) => (Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : [])

/** "2026-09-17T08:35:50Z" -> "08:35" today, "Tue" this week, else "17 Sep". */
export function shortWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const days = (now - d) / 86_400_000
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export const clockOf = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''

// ── loaders ──────────────────────────────────────────────────────────────

export async function getAgents() {
  const list = rows(await rest('agents'))
  return list.map((a) => ({
    id: a.id,
    name: a.name || 'Untitled agent',
    model: `v${a.active_version ?? 1} · ${a.node_count ?? 0} nodes`,
    status: statusLabel(a.status),
    channels: (a.channels ?? []).map(channelLabel),
    description: a.description?.trim() || 'No description set for this agent.',
    conversations: null, // not returned by list_agents; joined from conversations
    resolution: null,
    updatedAt: a.updated_at,
  }))
}

/**
 * Conversations joined to customers — list_conversations returns a customer_id
 * but no name, and the list view is unreadable without one.
 */
export async function getConversations() {
  const [convoRes, custRes, agentRes] = await Promise.all([
    rest('conversations'),
    rest('customers').catch(() => ({ data: [] })),
    rest('agents').catch(() => ({ data: [] })),
  ])

  const byId = new Map(rows(custRes).map((c) => [c.id, c]))
  const agentById = new Map(rows(agentRes).map((a) => [a.id, a.name]))

  return rows(convoRes).map((c) => {
    const customer = byId.get(c.customer_id)
    // The console titles a thread by whatever identifies it best: a name, else
    // the phone, else a short id — never a bare "Anonymous".
    const title =
      customer?.name || customer?.phone || `Conversation ${String(c.id).slice(0, 8)}`
    return {
      id: c.id,
      customerId: c.customer_id,
      agentId: c.workflow_id,
      agent: agentById.get(c.workflow_id) ?? null,
      title,
      name: customer?.name || 'Anonymous session',
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
export function timeAgo(iso) {
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
export function duration(fromIso, toIso) {
  if (!fromIso || !toIso) return '—'
  const secs = Math.max(0, Math.round((new Date(toIso) - new Date(fromIso)) / 1000))
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
export async function getMessages(conversationId) {
  const res = await rest(`conversations/${conversationId}/events`, {
    limit: 1000,
    include: 'tool_io,files',
  })
  return rows(res).map((e) => {
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
export function callInfoOf(events = []) {
  const at = (type) => events.find((e) => e.eventType === type)?.at ?? null
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

export async function getCustomer(customerId) {
  if (!customerId) return null
  const res = await rest(`customers/${customerId}`)
  const c = res?.data ?? res
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
export async function getRecordings(conversationId) {
  const res = await rest(`conversations/${conversationId}/recordings`)
  const legs = Array.isArray(res?.recordings) ? res.recordings : []
  const LABEL = { combined: 'Full call', caller: 'Customer only', ai: 'Assistant only' }
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
export async function getAnalytics(window) {
  const params = window?.from && window?.to ? { start_date: window.from, end_date: window.to } : null
  const a = await rest('analytics/summary', params)
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

export async function getSummary() {
  // Totals come from the analytics endpoint (authoritative, covers everything);
  // the per-day series still has to be derived, since nothing returns it.
  const today = new Date().toISOString().slice(0, 10)
  const [convos, agents, analytics, todayStats] = await Promise.all([
    getConversations(),
    getAgents(),
    getAnalytics().catch(() => null),
    getAnalytics({ from: today, to: today }).catch(() => null),
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
    const hit = slot.get(new Date(c.createdAt).toDateString())
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
    today: todayStats,
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
export async function getCalls() {
  const list = rows(await rest('calls'))
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
export function spoken(seconds) {
  if (seconds === null || seconds === undefined) return null
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
export const getPhoneNumbers = () => Promise.reject(new UnavailableError('phoneNumbers'))
