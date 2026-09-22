/**
 * What the conversation views agree on about channels.
 *
 * Shared between the list rail and the composer so the two can't drift: a chip
 * that filters by "WhatsApp" and a composer that sends on "whatsapp" have to
 * mean the same thing.
 */

/**
 * Filter chips, fixed rather than derived from the data.
 *
 * Deriving them meant a channel with no conversations yet simply had no chip,
 * so there was no way to tell "nothing on SMS" from "SMS isn't a thing here".
 * Anything the workspace reports outside this list is appended by the rail.
 */
export const CHANNEL_FILTERS = ['All', 'WhatsApp', 'Web', 'Phone', 'SMS', 'Email']

/**
 * Channel as a colour on a row's leading edge.
 *
 * Where a thread came from, not how it went — the status badge covers that.
 * Anything unmapped falls back to the neutral slate.
 */
export const CHANNEL_EDGE: Record<string, string> = {
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
export function channelsOf(c: { channel?: string; channels?: string[] }): string[] {
  const all = c.channels?.length ? c.channels : [c.channel].filter(Boolean)
  return [c.channel, ...all.filter((x) => x && x !== c.channel)].filter(
    (x): x is string => Boolean(x),
  )
}

export const ANY_AGENT = { id: 'all', name: 'All agents' }
/** Conversations whose workflow no longer exists still need to be reachable. */
export const GONE_AGENT = { id: 'gone', name: 'Deleted or unknown agent' }
