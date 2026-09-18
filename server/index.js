/**
 * Client-review backend.
 *
 * This is deliberately NOT a passthrough. The developer console (../client-ui)
 * proxies the workspace API straight through; this one re-shapes every
 * response and hands the browser only what a client should see.
 *
 * The rule: technical detail is removed HERE, on the server, not hidden in the
 * UI. A client opening devtools sees the same clean payload the page renders —
 * no workflow ids, no tool names or arguments, no MCP surface, no credentials,
 * no connected-server list. Those endpoints simply don't exist on this process.
 *
 * Run: node server/index.js   (or `npm run proxy`)
 */
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env')
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath)
  } catch (err) {
    console.warn(`[client-review] could not read .env: ${err.message}`)
  }
}

const KEY = process.env.PERFOX_API_KEY ?? ''
const API_BASE = process.env.PERFOX_API_BASE ?? 'https://siva-workspace-api.perfox.ai/api/v1'
const PORT = Number(process.env.PROXY_PORT ?? 8788)

/* ── plain-language labels ─────────────────────────────────── */

const CHANNEL = {
  web: 'Website',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  mobile: 'Mobile app',
}

// The workspace's raw statuses read like database values. These are what a
// client would actually say about a conversation.
const STATUS = {
  resolved: { label: 'Resolved', tone: 'good', note: 'The customer got what they needed' },
  ended: { label: 'Completed', tone: 'neutral', note: 'The conversation finished normally' },
  abandoned: { label: 'Left early', tone: 'warn', note: 'The customer stopped replying' },
  active: { label: 'In progress', tone: 'info', note: 'Still going' },
}

const channelLabel = (c) => CHANNEL[c] ?? (c ? c[0].toUpperCase() + c.slice(1) : 'Unknown')
const statusOf = (s) =>
  STATUS[s] ?? { label: s ? s[0].toUpperCase() + s.slice(1) : 'Unknown', tone: 'neutral', note: '' }

/**
 * Transcript events a client should read. Tool calls, their arguments and
 * results, latency figures and status_change rows are dropped outright —
 * they describe how the assistant works, not what the customer experienced.
 */
const EVENT_NOTE = {
  call_started: 'Call started',
  call_ended: 'Call ended',
  call_recorded: 'Call recorded',
  identity_resolved: 'Customer identified',
}

/* ── upstream ──────────────────────────────────────────────── */

const cache = new Map()
const TTL = 30_000

async function api(path) {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL) return hit.body

  const res = await fetch(`${API_BASE}/${path}`, {
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Upstream returned ${res.status} for ${path}`)
  const body = await res.json()
  cache.set(path, { at: Date.now(), body })
  return body
}

const rows = (r) => (Array.isArray(r?.data) ? r.data : [])

/* ── shaping ───────────────────────────────────────────────── */

/** Everything a client may see about one conversation. */
function shapeConversation(c, customersById, assistantsById) {
  const customer = customersById.get(c.customer_id)
  const status = statusOf(c.status)
  return {
    id: c.id,
    reference: String(c.id).slice(0, 8).toUpperCase(),
    customerName: customer?.name || null,
    customerPhone: customer?.phone || null,
    customerEmail: customer?.email || null,
    channel: channelLabel(c.channel_started ?? c.channels?.[0]),
    otherChannels: (c.channels ?? []).map(channelLabel),
    status: status.label,
    statusTone: status.tone,
    statusNote: status.note,
    summary: c.summary?.trim() || null,
    assistant: assistantsById.get(c.workflow_id) ?? null, // name only, never the id
    startedAt: c.created_at,
    lastActivityAt: c.updated_at,
  }
}

/** Transcript, minus the machinery. */
function shapeTranscript(events) {
  const out = []
  for (const e of events) {
    if (e.event_type === 'user_message') {
      out.push({ id: e.id, kind: 'customer', text: e.text ?? '', at: e.created_at })
    } else if (e.event_type === 'ai_response') {
      out.push({ id: e.id, kind: 'assistant', text: e.text ?? '', at: e.created_at })
    } else if (EVENT_NOTE[e.event_type]) {
      out.push({ id: e.id, kind: 'note', text: EVENT_NOTE[e.event_type], at: e.created_at })
    }
    // tool_call, tool_result, status_change: intentionally dropped.
  }
  return out
}

async function loadCore() {
  const [convos, customers, assistants] = await Promise.all([
    api('conversations'),
    api('customers').catch(() => ({ data: [] })),
    api('agents').catch(() => ({ data: [] })),
  ])
  const customersById = new Map(rows(customers).map((c) => [c.id, c]))
  const assistantsById = new Map(rows(assistants).map((a) => [a.id, a.name]))
  return {
    conversations: rows(convos).map((c) => shapeConversation(c, customersById, assistantsById)),
    customersRaw: rows(customers),
    assistantsRaw: rows(assistants),
  }
}

/* ── responses ─────────────────────────────────────────────── */

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function overview() {
  const { conversations, customersRaw, assistantsRaw } = await loadCore()

  const byChannel = new Map()
  for (const c of conversations) byChannel.set(c.channel, (byChannel.get(c.channel) ?? 0) + 1)

  const byStatus = new Map()
  for (const c of conversations) byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1)

  // Conversations per day for the last 14 days, oldest first.
  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    days.push({ key: d.toDateString(), label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), value: 0 })
  }
  const slot = new Map(days.map((d) => [d.key, d]))
  for (const c of conversations) {
    const hit = slot.get(new Date(c.startedAt).toDateString())
    if (hit) hit.value += 1
  }

  const week = Date.now() - 7 * 86_400_000
  const lastWeek = conversations.filter((c) => new Date(c.startedAt).getTime() >= week)
  const resolved = byStatus.get('Resolved') ?? 0
  const finished = conversations.filter((c) => c.status !== 'In progress').length

  const liveChannels = new Set()
  for (const a of assistantsRaw) {
    if (a.status === 'published') for (const ch of a.channels ?? []) liveChannels.add(channelLabel(ch))
  }

  return {
    totals: {
      conversations: conversations.length,
      thisWeek: lastWeek.length,
      customers: customersRaw.length,
      assistants: assistantsRaw.filter((a) => a.status === 'published').length,
      resolvedRate: finished > 0 ? resolved / finished : null,
      // No average-duration figure: the only timestamps available are the
      // record's created_at/updated_at, and on an abandoned session those can
      // sit hours apart. That would read as "average chat lasted 7 hours",
      // which is false. Omitted rather than shown wrong.
      channelsLive: liveChannels.size,
    },
    byChannel: [...byChannel.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count),
    byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
    activity: days.map(({ label, value }) => ({ label, value })),
    recent: conversations.slice(0, 6),
  }
}

async function channels() {
  const { conversations, assistantsRaw } = await loadCore()

  // A channel's real state is whether customers are actually arriving on it.
  // The assistants' declared `channels` array is not reliable here: every
  // assistant in this workspace declares only "web", yet WhatsApp and Phone
  // conversations exist — those are wired up outside what the API reports.
  // So activity is the signal, and the assistant list is supporting detail.
  const used = new Map()
  for (const c of conversations) {
    const e = used.get(c.channel) ?? { channel: c.channel, conversations: 0, lastActivityAt: null, names: new Set() }
    e.conversations += 1
    if (c.assistant) e.names.add(c.assistant)
    if (!e.lastActivityAt || new Date(c.lastActivityAt) > new Date(e.lastActivityAt)) {
      e.lastActivityAt = c.lastActivityAt
    }
    used.set(c.channel, e)
  }

  const recently = Date.now() - 7 * 86_400_000

  return {
    channels: [...used.values()]
      .map((e) => ({
        channel: e.channel,
        conversations: e.conversations,
        lastActivityAt: e.lastActivityAt,
        active: e.lastActivityAt ? new Date(e.lastActivityAt).getTime() >= recently : false,
        assistants: [...e.names].sort(),
      }))
      .sort((a, b) => b.conversations - a.conversations),
    assistantsTotal: assistantsRaw.filter((a) => a.status === 'published').length,
  }
}

async function customers() {
  const { conversations, customersRaw } = await loadCore()
  const counts = new Map()
  const last = new Map()
  for (const c of conversations) {
    if (!c.customerName) continue
    counts.set(c.customerName, (counts.get(c.customerName) ?? 0) + 1)
    const prev = last.get(c.customerName)
    if (!prev || new Date(c.lastActivityAt) > new Date(prev)) last.set(c.customerName, c.lastActivityAt)
  }
  return {
    customers: customersRaw
      .map((c) => ({
        id: c.id,
        name: c.name || 'Unnamed',
        phone: c.phone || null,
        email: c.email || null,
        language: c.preferred_language || null,
        tags: (c.tags ?? []).filter((t) => t !== 'ephemeral'),
        firstSeen: c.created_at,
        lastSeen: last.get(c.name) ?? c.updated_at,
        conversations: counts.get(c.name) ?? 0,
      }))
      .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)),
  }
}

async function assistants() {
  const { conversations, assistantsRaw } = await loadCore()
  const counts = new Map()
  for (const c of conversations) {
    if (c.assistant) counts.set(c.assistant, (counts.get(c.assistant) ?? 0) + 1)
  }
  return {
    assistants: assistantsRaw
      .map((a) => ({
        id: a.id,
        name: a.name || 'Untitled assistant',
        description: a.description?.trim() || null,
        live: a.status === 'published',
        channels: (a.channels ?? []).map(channelLabel),
        conversations: counts.get(a.name) ?? 0,
        // active_version and node_count deliberately omitted — build detail.
      }))
      .sort((a, b) => b.conversations - a.conversations),
  }
}

const UUID = /^[0-9a-f-]{20,40}$/i

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  if (req.method !== 'GET') return send(res, 405, { error: 'This service is read-only.' })

  try {
    if (path === '/api/health') {
      return send(res, 200, { ok: true, configured: KEY.length > 0 })
    }
    if (!KEY) return send(res, 503, { error: 'Not configured. Add PERFOX_API_KEY to .env.' })

    if (path === '/api/overview') return send(res, 200, await overview())
    if (path === '/api/channels') return send(res, 200, await channels())
    if (path === '/api/customers') return send(res, 200, await customers())
    if (path === '/api/assistants') return send(res, 200, await assistants())

    if (path === '/api/conversations') {
      const { conversations } = await loadCore()
      return send(res, 200, { conversations })
    }

    const detail = path.match(/^\/api\/conversations\/([^/]+)$/)
    if (detail) {
      const id = decodeURIComponent(detail[1])
      if (!UUID.test(id)) return send(res, 400, { error: 'Not a valid conversation reference.' })
      const { conversations } = await loadCore()
      const conversation = conversations.find((c) => c.id === id)
      if (!conversation) return send(res, 404, { error: 'Conversation not found.' })
      const events = await api(`conversations/${id}/events?limit=1000`)
      return send(res, 200, { conversation, transcript: shapeTranscript(rows(events)) })
    }

    return send(res, 404, { error: 'Not found.' })
  } catch (err) {
    // Upstream wording can leak product internals; keep the client's view plain.
    console.error('[client-review]', err.message)
    return send(res, 502, { error: 'Could not load this right now. Please try again.' })
  }
})

server.listen(PORT, () => {
  console.log(`[client-review] http://localhost:${PORT}`)
  console.log(`[client-review] read-only · key ${KEY ? 'configured' : 'MISSING'}`)
  console.log(`[client-review] /api/overview /api/conversations /api/customers /api/channels /api/assistants`)
})
