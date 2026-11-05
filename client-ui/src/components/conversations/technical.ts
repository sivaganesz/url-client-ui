import type { Message } from '../../lib/types'

/**
 * System events that are part of the conversation rather than beneath it.
 *
 * On a voice channel these ARE the conversation: a call starting and ending is
 * the whole shape of what happened, and hiding them would leave a transcript
 * of a phone call with no phone call in it. Everything else a system event can
 * say — a status changing, an identity resolving, a grounding lookup — is the
 * platform talking to itself.
 */
const SPOKEN_EVENTS = new Set(['call_started', 'call_ended', 'call_recorded'])

/**
 * Machinery: true for anything the reader did not say and was not told.
 *
 * Hidden by default in the thread, because that page is read to decide whether
 * to step into a conversation, and a reader doing that is served by the
 * conversation alone. Hidden rather than dropped, though — the day an agent
 * quotes a customer the wrong price, the tool call it made is the only record
 * of where the number came from.
 */
export const isTechnical = (m: Message): boolean =>
  m.role === 'tool' || (m.role === 'system' && !SPOKEN_EVENTS.has(m.eventType ?? ''))

/** How many events the thread is holding back, for the control that reveals them. */
export const technicalCount = (messages: Message[]): number => messages.filter(isTechnical).length
