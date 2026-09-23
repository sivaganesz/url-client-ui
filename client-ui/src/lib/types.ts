/**
 * What the workspace API returns, and what the UI reads.
 *
 * None of the wire shapes below are documented anywhere. They were established
 * by probing the live API, so they describe what it *did* return, not what it
 * promises to. Fields are marked optional wherever a response was seen without
 * them — an optimistic type here would only move a runtime crash somewhere
 * harder to find.
 *
 * Two layers, kept apart deliberately:
 *   · `Api*`  — the raw payload, snake_case, exactly as it arrives
 *   · the rest — what components consume, after mapping in api.ts
 */

/* ── wire shapes ─────────────────────────────────────────── */

/** Every list endpoint answers with this envelope. `next_cursor` only on /calls. */
export interface ApiList<T> {
  data: T[]
  next_cursor?: string | null
}

export interface ApiAgent {
  id: string
  name?: string
  description?: string
  status?: string
  channels?: string[]
  active_version?: number
  node_count?: number
  created_at?: string
  updated_at?: string
  /** Only on GET /agents/{id} — the list endpoint omits the graph. */
  nodes?: ApiNode[]
  edges?: unknown[]
}

/**
 * A node on an agent's canvas.
 *
 * `config.channel` on a trigger is how the console decides which channels an
 * agent can be reached on — the list endpoint's `channels` reports "web" for
 * every agent and cannot be used for it.
 */
export interface ApiNode {
  type: string
  config?: {
    trigger_type?: string
    channel?: string
    /** Webhook triggers carry the channel under a different key. */
    webhook_channel?: string
    [key: string]: unknown
  }
}

export interface ApiConversation {
  id: string
  customer_id?: string
  workflow_id?: string
  status?: string
  channel_started?: string
  channels?: string[]
  summary?: string
  created_at?: string
  updated_at?: string
}

export interface ApiCustomer {
  id: string
  name?: string
  phone?: string
  email?: string
  created_at?: string
  [key: string]: unknown
}

export interface ApiCall {
  conversation_id: string
  customer_id?: string
  end_user?: { name?: string; phone?: string }
  channel?: string
  status?: string
  summary?: string
  started_at?: string
  ended_at?: string
  duration_seconds?: number
  /** Means "available now", not "was ever recorded" — audio ages out. */
  has_recording?: boolean
}

export interface ApiRecording {
  leg: string
  url: string
}

export interface ApiRecordings {
  conversation_id?: string
  expires_in_seconds?: number
  recordings?: ApiRecording[]
}

export interface ApiAnalytics {
  window?: { start_date: string | null; end_date: string | null }
  conversations?: {
    total?: number
    active?: number
    resolved?: number
    escalated?: number
    abandoned?: number
    /** A percentage (13.98), not a fraction. */
    resolution_rate?: number
  }
  tokens?: { input?: number; output?: number; total?: number; llm_calls?: number }
  channels?: { channel: string; count: number }[]
}

export interface ApiCredits {
  balance?: number
  /** The same figure in millicredits — the integer the ledger actually holds. */
  balance_mc?: number
  low_balance?: boolean
  out_of_credits?: boolean
}

/** `date` changes format with the interval: 2026-09-22 | 2026-W39 | 2026-09. */
export interface ApiOverTimePoint {
  date: string
  count: number
  resolved: number
}

export interface ApiOutboundResult {
  conversation_id?: string
  execution_id?: string
  status?: string
  channel?: string
  /** False means the agent ran but has no Sender action — nothing went out. */
  send_authorized?: boolean
}

/* ── what the UI consumes ────────────────────────────────── */

export type ChannelLabel = 'Web' | 'Phone' | 'WhatsApp' | 'SMS' | 'Email' | 'Web voice' | string
export type StatusLabel = 'Resolved' | 'Ended' | 'Abandoned' | 'Active' | 'Draft' | 'Paused' | string

export interface Agent {
  id: string
  name: string
  model: string
  status: StatusLabel
  channels: ChannelLabel[]
  description: string
  conversations: number | null
  resolution: number | null
  updatedAt?: string
  /** Only from getAgentsWithChannels — the Sender actions on the canvas. */
  senders?: ChannelLabel[]
}

export interface Conversation {
  id: string
  /** First 8 characters of the id, for telling anonymous threads apart. */
  ref: string
  customerId?: string
  agentId?: string
  agent: string | null
  title: string
  name: string | null
  phone: string
  email: string
  channel: ChannelLabel
  channels: ChannelLabel[]
  status: StatusLabel
  preview: string
  time: string
  createdAt?: string
  updatedAt?: string
  unread: number
}

export type MessageRole = 'customer' | 'agent' | 'tool' | 'system'

export interface Message {
  id: string
  role: MessageRole
  author: string
  text: string
  time: string
  at?: string
  eventType?: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  toolStatus?: string
  toolLatencyMs?: number
}

export interface Call {
  id: string
  customerId?: string
  name: string | null
  phone: string | null
  channel: ChannelLabel
  status: StatusLabel
  summary: string | null
  startedAt?: string
  endedAt?: string
  durationSeconds: number | null
  hasRecording: boolean
}

export interface RecordingLeg {
  leg: string
  /** "Full call" / "Customer only" / "Assistant only". */
  label: string
  url: string
}

export interface Recordings {
  legs: RecordingLeg[]
  /** Signed links lapse (900s at present); the player counts down from here. */
  expiresInSeconds: number | null
  fetchedAt: number
}

export interface Analytics {
  total: number | null
  active: number | null
  resolved: number | null
  escalated: number | null
  abandoned: number | null
  /** A fraction (0.1398) — divided from the percentage the API sends. */
  resolutionRate: number | null
  window: ApiAnalytics['window'] | null
  tokensIn: number | null
  tokensOut: number | null
  tokensTotal: number | null
  llmCalls: number | null
  channels: { channel: ChannelLabel; count: number }[]
}

export interface Summary {
  analytics: Analytics | null
  totalConversations: number | null
  phoneConversations: number | null
  whatsappConversations: number | null
  webConversations: number | null
  totalAgents: number | null
  activeAgents: number | null
  pausedAgents: number | null
  resolutionRate: number | null
  channelSplit: { channel: ChannelLabel; count: number }[]
  volumeSeries: SeriesPoint[]
}

export interface Credits {
  balance: number | null
  low: boolean
  out: boolean
}

export interface SeriesPoint {
  label: string
  value: number
  date?: string
  resolved?: number
}

export interface AgentReach {
  published?: boolean
  channels: ChannelLabel[]
  senders: ChannelLabel[]
}

export interface OutboundResult {
  conversationId: string | null
  executionId: string | null
  status: string | null
  channel: string
  /** Absent on the wire means authorized; only text channels withhold it. */
  sendAuthorized: boolean
}

export interface OutboundRequest {
  agentId: string
  channel: string
  to: string
  openingMessage?: string
  customerId?: string
}

/* ── the shell ───────────────────────────────────────────── */

/**
 * Passed down the router outlet. Pages read it with
 * `useOutletContext<ShellContext>()` — react-router cannot infer it, so the
 * annotation is what keeps these honest.
 *
 * Calling is not here: it moved to `useCall()` in lib/operator, because the
 * audio session is the shell's, not a value a page hands upward.
 */
export interface ShellContext {
  openDrawer: () => void
}

/* ── connected numbers and addresses ─────────────────────── */

/** One row of GET /credentials/{id}/resources. */
export interface ApiResource {
  identifier: string
  label?: string
  /** The purpose, not the technology: phone | sms | whatsapp | email. */
  channel: string
  capabilities?: string[]
  provider?: string
  status?: string
  /**
   * ABSENT when nothing claims the identifier — not null.
   *
   * A spare number with no agent on it is a normal state rather than missing
   * data, which is why the field is simply not there. Read from the agents at
   * request time, so rebinding a number in the builder shows here at once.
   */
  assigned_agent?: { id: string; name: string }
  /** Added in the release that shipped this endpoint; older images omit it. */
  credential_id?: string
}

export interface ApiCredential {
  id: string
  name?: string
  type?: string
  status?: string
  /** Field NAMES a credential carries. Never their values. */
  config_fields?: string[]
}

/**
 * A number or address the workspace can be reached on.
 *
 * One identifier appears once per channel — the same number is a separate row
 * for voice and for WhatsApp, because they are bound to agents separately —
 * so `identifier` is not a key. `rowId` is.
 */
export interface Connection {
  rowId: string
  identifier: string
  label: string
  channel: ChannelLabel
  capabilities: string[]
  provider: string
  status: StatusLabel
  /** null here where the API omitted the field: nothing is bound to it. */
  agent: { id: string; name: string } | null
  credentialId: string
  credentialName: string
}

/** What a send or a call did, as the conversation surface reports it. */
export interface SendResult {
  ok: boolean
  text?: string
  /** The conversation a placed call opened — its own thread, not this one. */
  id?: string | null
  status?: string | null
}

/**
 * What the New conversation dialog hands back once an agent has reached out.
 *
 * It is the outbound result plus the two things the form knew and the API
 * does not return, so the caller can label a call screen without re-reading
 * the form it just closed.
 */
export interface StartedConversation extends OutboundResult {
  to: string
  agentName?: string
}

/* ── cases: the conversation log ─────────────────────────── */

/**
 * One row of GET /cases.
 *
 * A case IS a conversation — `id` is the conversation id, so the transcript
 * comes from /conversations/{id}/events without carrying a second identifier.
 *
 * The scored fields are ABSENT until the conversation has been judged, rather
 * than present and null. A case that has not been scored is a normal state, so
 * the UI says "not scored yet" instead of reading an absence as a zero.
 */
export interface ApiCase {
  id: string
  customer_id?: string
  customer_name?: string
  customer_email?: string
  customer_phone?: string

  /** The ticket lifecycle — NOT the AI's verdict. See `resolved`. */
  status?: string
  channel_started?: string
  channels?: string[]

  /**
   * Empty string when no agent matched the inbound at all.
   *
   * Set, with `workflow_name: null`, when an agent did handle it and was
   * deleted afterwards. The two are different facts and the UI keeps them
   * apart — collapsing them reports "unassigned" for a case that was handled.
   */
  workflow_id?: string
  workflow_name?: string | null

  summary?: string
  originator?: string
  last_message?: string
  message_count?: number

  /** Absent until scored. */
  sentiment_label?: string
  resolved?: boolean
  resolution_reason?: string
  /** Present only when true. */
  needs_followup?: boolean
  qa_scores?: Record<string, number>

  created_at?: string
  updated_at?: string
}

export interface ApiPagination {
  page: number
  page_size: number
  total: number
  total_pages: number
}

/** How an agent came to be, or not be, on a case. */
export type Attribution =
  | { kind: 'agent'; name: string }
  /** An agent handled it and was deleted afterwards. */
  | { kind: 'deleted' }
  /** Nothing matched the inbound. */
  | { kind: 'none' }

export interface Case {
  id: string
  customerId?: string
  /** The best name available; falls back to the phone, email, or the ref. */
  who: string
  ref: string
  email: string
  phone: string

  /** The ticket lifecycle. Separate from the verdict below. */
  status: StatusLabel
  channel: ChannelLabel
  channels: ChannelLabel[]
  originator: string

  agent: Attribution
  summary: string
  lastMessage: string
  messages: number

  /** null until the conversation has been scored — not false. */
  resolved: boolean | null
  resolutionReason: string
  sentiment: string | null
  needsFollowUp: boolean
  qa: Record<string, number> | null
  /** The single headline figure, when the scores carry one. */
  qaOverall: number | null

  createdAt?: string
  updatedAt?: string
}

export interface CaseFilters {
  q?: string
  status?: string
  channel?: string
  originator?: string
  needs_followup?: string
  created_after?: string
  created_before?: string
  sort_by?: string
  sort_order?: string
}

export interface CasePage {
  cases: Case[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
