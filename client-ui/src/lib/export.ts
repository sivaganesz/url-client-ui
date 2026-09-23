import type { Message } from './types'

/**
 * A conversation, as a file.
 *
 * One exporter for both places that offer it — the conversation page and the
 * Analytics log. They produced different files before this existed, which is
 * the sort of difference nobody notices until two people compare exports of
 * the same conversation and find they disagree.
 *
 * Three formats, each for a different reader:
 *   · JSON — the record, for a machine or an archive
 *   · TXT  — the transcript, for pasting into a ticket
 *   · MD   — the transcript with its summary and verdict, for a write-up
 *
 * One workspace's data, always. Every caller holds only its own customer's
 * conversation because the backend resolved the workspace from the session
 * before any of it was fetched; the file is stamped with that workspace so an
 * export that gets forwarded still says whose it is.
 */

export interface ExportMeta {
  id: string
  status?: string
  startedAt?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  channel?: string
  agent?: string
  summary?: string
  /** The AI's verdict, where there is one. */
  sentiment?: string | null
  resolved?: boolean | null
  needsFollowUp?: boolean
  qaOverall?: number | null
  resolutionReason?: string
  /** Who pulled the file, and out of which workspace. */
  exportedBy?: string
  workspace?: string
}

export type ExportFormat = 'json' | 'txt' | 'md'

const FORMATS: Record<ExportFormat, { type: string; label: string }> = {
  json: { type: 'application/json', label: 'JSON' },
  txt: { type: 'text/plain', label: 'TXT' },
  md: { type: 'text/markdown', label: 'MD' },
}

export const EXPORT_FORMATS = (Object.keys(FORMATS) as ExportFormat[]).map((id) => ({
  id,
  label: FORMATS[id].label,
}))

/** Saves a Blob without leaving the page. */
function save(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * What a system event is called in prose.
 *
 * The REST events endpoint returns only `{id, event_type, actor, channel,
 * created_at}` for these — no `data` payload under any `include` mode — so a
 * status change can be named but not described. Writing "Status → ended
 * (Workflow completed)" would mean inferring the transition from the case's
 * current status and inventing the reason outright.
 */
const SYSTEM_EVENTS: Record<string, string> = {
  call_started: 'Call started',
  call_ended: 'Call ended',
  call_recorded: 'Call recorded',
  status_change: 'Status changed',
  identity_resolved: 'Customer identified',
}

const callOf = (m: Message) =>
  `${m.toolName ?? 'tool'}(${m.toolInput == null ? '' : JSON.stringify(m.toolInput)})`

/**
 * A tool event as one or two lines: `→` what was called with, `←` what came
 * back.
 *
 * The call and the result arrive as separate events, so each prints only the
 * half it carries — a result reprinting the call would show `phone_caller()`
 * with no arguments beside the real call that had them, and read as a second
 * attempt that was made differently.
 */
function toolParts(m: Message): string[] {
  const result = m.eventType === 'tool_result'
  if (!result) return [`→ ${callOf(m)}`]
  if (m.toolOutput != null) return [`← ${JSON.stringify(m.toolOutput)}`]
  return [`← ${m.toolName ?? 'tool'} returned nothing`]
}

/**
 * One transcript entry, as plain-text lines.
 *
 * Tool calls and system events are kept rather than dropped. A transcript
 * showing only what was said hides why it was said — read without the failed
 * `phone_caller` call above it, the agent's apology has no cause.
 */
function textLines(m: Message): string[] {
  const at = m.time ? `[${m.time}] ` : ''

  if (m.role === 'tool') return toolParts(m).map((line) => `${at}${line}`)

  // Raw event types here, named ones in Markdown: this file gets grepped.
  if (m.role === 'system') {
    return [`${at}(${m.eventType ?? 'event'})${m.text ? ` ${m.text}` : ''}`]
  }

  return [`${at}${m.author}: ${m.text}`]
}

function markdownEntry(m: Message): string {
  const at = m.time ? ` · ${m.time}` : ''

  if (m.role === 'tool') return toolParts(m).map((line) => `> \`${line}\`${at}`).join('\n>\n')
  if (m.role === 'system') {
    const name = SYSTEM_EVENTS[m.eventType ?? ''] ?? m.eventType ?? 'Event'
    return `> **${name}**${m.text ? ` ${m.text}` : ''}${at}`
  }
  return `**${m.author}**${at}\n\n${m.text}`
}

/**
 * Entries worth printing.
 *
 * A speech event with no text prints as "AI Agent:" and nothing else, which
 * reads as a silence the agent never had. JSON keeps every event, because
 * there it is the record rather than the reading.
 */
const readable = (messages: Message[]) =>
  messages.filter((m) => m.role === 'tool' || m.role === 'system' || m.text !== '')

const yesNo = (v: boolean | null | undefined) => (v == null ? '—' : v ? 'Yes' : 'No')

/** Long form, so a file read months later still says which day it was. */
const stamp = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toString()
}

function toMarkdown(meta: ExportMeta, messages: Message[]): string {
  const out: string[] = [`# Conversation ${meta.id}`, '']

  out.push(
    ...([
      meta.status && `- **Status:** ${meta.status}`,
      meta.startedAt && `- **Started:** ${stamp(meta.startedAt)}`,
      meta.channel && `- **Channel:** ${meta.channel}`,
      meta.agent && `- **Handled by:** ${meta.agent}`,
      meta.customerName && `- **Customer:** ${meta.customerName}`,
    ].filter(Boolean) as string[]),
    '',
  )

  if (meta.summary) out.push('## Summary', '', meta.summary, '')

  /**
   * Only once the conversation has been scored. A verdict section of dashes
   * says "we judged this and found nothing", which is a different claim from
   * "nobody has judged it yet".
   */
  if (meta.sentiment || meta.resolved != null || meta.qaOverall != null) {
    out.push('## Outcome', '')
    if (meta.sentiment) out.push(`- **Sentiment:** ${meta.sentiment}`)
    out.push(`- **Solved:** ${yesNo(meta.resolved)}`)
    out.push(`- **Needs follow-up:** ${yesNo(meta.needsFollowUp)}`)
    if (meta.qaOverall != null) out.push(`- **QA score:** ${meta.qaOverall}/10`)
    if (meta.resolutionReason) out.push(`- **Reason:** ${meta.resolutionReason}`)
    out.push('')
  }

  if (meta.customerName || meta.customerPhone || meta.customerEmail) {
    out.push('## Captured information', '')
    if (meta.customerName) out.push(`- **Name:** ${meta.customerName}`)
    if (meta.customerPhone) out.push(`- **Phone:** ${meta.customerPhone}`)
    if (meta.customerEmail) out.push(`- **Email:** ${meta.customerEmail}`)
    out.push('')
  }

  const entries = readable(messages)
  out.push('## Transcript', '')
  out.push(
    entries.length
      ? entries.map(markdownEntry).join('\n\n')
      : '_No transcript was recorded for this conversation._',
  )

  return `${out.join('\n')}\n`
}

function toText(meta: ExportMeta, messages: Message[]): string {
  const head = [
    `Conversation ${meta.id}`,
    meta.status && `Status: ${meta.status}`,
    meta.startedAt && `Started: ${stamp(meta.startedAt)}`,
    meta.customerName && `Customer: ${meta.customerName}`,
  ].filter(Boolean)

  const entries = readable(messages)
  const body = entries.length
    ? entries.flatMap(textLines).join('\n')
    : 'No transcript was recorded for this conversation.'

  return `${head.join('\n')}\n\n─── Transcript ───\n\n${body}\n`
}

/**
 * Downloads one conversation.
 *
 * `messages` is the transcript, which the log fetches on demand — a case row
 * carries no events, and prefetching them for every row on screen would be a
 * hundred requests nobody asked for.
 */
export function exportConversation(
  format: ExportFormat,
  meta: ExportMeta,
  messages: Message[],
): void {
  const { exportedBy, workspace, ...conversation } = meta
  const name = `conversation-${meta.id.slice(0, 8)}.${format}`

  if (format === 'json') {
    const body = {
      conversation,
      messages,
      exported_at: new Date().toISOString(),
      ...(exportedBy ? { exported_by: exportedBy } : {}),
      ...(workspace ? { workspace } : {}),
    }
    save(name, JSON.stringify(body, null, 2), FORMATS.json.type)
    return
  }

  const body = format === 'md' ? toMarkdown(meta, messages) : toText(meta, messages)
  save(name, body, FORMATS[format].type)
}
