/**
 * Mock rows for the conversation log on Analytics.
 *
 * Nothing here is live. The workspace scores no conversation, raises no
 * ticket and records no QA note, so every field below is invented — kept in
 * its own module so the swap to a real loader is a one-line import change and
 * nobody has to guess which parts were real.
 *
 * Shape is the contract src/lib/api.js will map onto:
 *   at            ISO timestamp
 *   who           display name, or the conversation reference when unnamed
 *   direction     'customer' | 'agent' | 'system' — who moved last
 *   channel       label as the rest of the console spells it
 *   triggeredBy   agent or workflow that opened the conversation
 *   summary       one line, or null while scoring is pending
 *   ai            null while pending, else { sentiment, solved, followUp, qaScore, note }
 *   ticketStatus  'Active' | 'Ended' | 'Resolved' | 'Escalated' | 'Abandoned'
 */
export const conversationLog = [
  {
    id: 'log_1',
    at: '2026-09-22T12:37:00+05:30',
    who: 'Siva',
    direction: 'agent',
    channel: 'WhatsApp',
    triggeredBy: 'client-ui-testing',
    summary: null,
    ai: null,
    ticketStatus: 'Resolved',
  },
  {
    id: 'log_2',
    at: '2026-09-22T10:37:00+05:30',
    who: 'Conversation 01a0c783',
    direction: 'customer',
    channel: 'Web',
    triggeredBy: 'Deleted agent',
    summary: 'The customer attempted to use the booking flow and gave up at payment.',
    ai: {
      sentiment: 'Negative',
      solved: false,
      followUp: true,
      qaScore: 6,
      note: 'Agent failed to perform requested action and lacked access to tools.',
    },
    ticketStatus: 'Abandoned',
  },
  {
    id: 'log_3',
    at: '2026-09-22T10:53:00+05:30',
    who: 'Siva',
    direction: 'system',
    channel: 'Phone',
    triggeredBy: 'Deleted agent',
    summary: 'The customer sought assistance with a delayed refund and was not given a date.',
    ai: {
      sentiment: 'Negative',
      solved: false,
      followUp: true,
      qaScore: 5,
      note: 'Escalation path never offered despite two explicit requests for a human.',
    },
    ticketStatus: 'Ended',
  },
  {
    id: 'log_4',
    at: '2026-09-21T16:12:00+05:30',
    who: 'Anna Skillmine',
    direction: 'customer',
    channel: 'WhatsApp',
    triggeredBy: 'Reception Bot',
    summary: 'Rescheduled an appointment to the following Tuesday and confirmed by message.',
    ai: {
      sentiment: 'Positive',
      solved: true,
      followUp: false,
      qaScore: 9,
      note: 'Booking confirmed and read back to the customer before closing.',
    },
    ticketStatus: 'Resolved',
  },
  {
    id: 'log_5',
    at: '2026-09-21T14:05:00+05:30',
    who: 'Ravi Menon',
    direction: 'agent',
    channel: 'SMS',
    triggeredBy: 'Recall Bot',
    summary: 'Reminder for a missed screening; customer asked to be called instead.',
    ai: {
      sentiment: 'Neutral',
      solved: true,
      followUp: true,
      qaScore: 7,
      note: 'Callback logged but no time agreed with the customer.',
    },
    ticketStatus: 'Escalated',
  },
  {
    id: 'log_6',
    at: '2026-09-21T09:48:00+05:30',
    who: 'Conversation 01a0bb41',
    direction: 'customer',
    channel: 'Email',
    triggeredBy: 'Billing Bot',
    summary: 'Duplicate invoice query; receipt resent to the address on file.',
    ai: {
      sentiment: 'Positive',
      solved: true,
      followUp: false,
      qaScore: 8,
      note: 'Correct invoice identified on the first attempt.',
    },
    ticketStatus: 'Resolved',
  },
  {
    id: 'log_7',
    at: '2026-09-20T18:30:00+05:30',
    who: 'Priya Nair',
    direction: 'customer',
    channel: 'Phone',
    triggeredBy: 'Triage Bot',
    summary: null,
    ai: null,
    ticketStatus: 'Active',
  },
  {
    id: 'log_8',
    at: '2026-09-20T11:22:00+05:30',
    who: 'Conversation 01a0a9f2',
    direction: 'system',
    channel: 'Web',
    triggeredBy: 'After-hours Bot',
    summary: 'Out-of-hours message taken; queued for the morning and never picked up.',
    ai: {
      sentiment: 'Neutral',
      solved: false,
      followUp: true,
      qaScore: 4,
      note: 'Queued callback expired without being actioned.',
    },
    ticketStatus: 'Abandoned',
  },
]
