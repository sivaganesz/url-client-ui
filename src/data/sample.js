/**
 * Placeholder data for the structural pass. Every module here is replaced by a
 * live call in src/lib/api.js — the shapes are the contract the API layer maps
 * onto, so pages don't change when the source does.
 */

export const summary = {
  totalConversations: 12480,
  inboundCalls: 3914,
  outboundCalls: 1236,
  totalAgents: 6,
  activeAgents: 5,
  pausedAgents: 1,
  resolutionRate: 0.824,
  tokensToday: 1_840_000,
  tokensTotal: 412_600_000,
  totalCalls: 3842,
  totalNumbers: 8,
  liveNumbers: 7,
  pendingNumbers: 1,
}

export const volumeSeries = [
  { day: 'Mon', whatsapp: 286, phone: 190, email: 74, sms: 52 },
  { day: 'Tue', whatsapp: 324, phone: 205, email: 81, sms: 61 },
  { day: 'Wed', whatsapp: 298, phone: 231, email: 69, sms: 48 },
  { day: 'Thu', whatsapp: 356, phone: 242, email: 92, sms: 66 },
  { day: 'Fri', whatsapp: 391, phone: 268, email: 88, sms: 71 },
  { day: 'Sat', whatsapp: 244, phone: 152, email: 41, sms: 38 },
  { day: 'Sun', whatsapp: 188, phone: 118, email: 33, sms: 29 },
]

export const resolutionSeries = [
  { day: 'Mon', rate: 0.79 },
  { day: 'Tue', rate: 0.81 },
  { day: 'Wed', rate: 0.78 },
  { day: 'Thu', rate: 0.84 },
  { day: 'Fri', rate: 0.86 },
  { day: 'Sat', rate: 0.83 },
  { day: 'Sun', rate: 0.82 },
]

export const channelSplit = [
  { channel: 'WhatsApp', count: 5204 },
  { channel: 'Phone', count: 4154 },
  { channel: 'Email', count: 1806 },
  { channel: 'SMS', count: 1316 },
]

export const conversations = [
  {
    id: 'cv_1',
    name: 'Anita Kumar',
    phone: '+91 93602 35499',
    email: 'anita.kumar@example.com',
    channel: 'WhatsApp',
    time: '10:24',
    preview: 'Perfect, thank you!',
    status: 'Resolved',
    agent: 'Reception Bot',
    unread: 0,
  },
  {
    id: 'cv_2',
    name: 'Rahul Iyer',
    phone: '+91 98407 11234',
    email: 'rahul.iyer@example.com',
    channel: 'Phone',
    time: '09:58',
    preview: 'Call ended — appointment booked',
    status: 'Resolved',
    agent: 'Reception Bot',
    unread: 0,
  },
  {
    id: 'cv_3',
    name: 'Sneha Menon',
    phone: '+91 99401 55621',
    email: 'sneha.menon@example.com',
    channel: 'Email',
    time: 'Tue',
    preview: 'Could you resend the invoice?',
    status: 'Active',
    agent: 'Billing Bot',
    unread: 2,
  },
  {
    id: 'cv_4',
    name: 'Vikram Rao',
    phone: '+91 90031 77482',
    email: 'vikram.rao@example.com',
    channel: 'SMS',
    time: 'Tue',
    preview: 'Reschedule to next week please',
    status: 'Active',
    agent: 'Recall Bot',
    unread: 1,
  },
  {
    id: 'cv_5',
    name: 'Priya Nair',
    phone: '+91 87654 32190',
    email: 'priya.nair@example.com',
    channel: 'WhatsApp',
    time: 'Mon',
    preview: 'What are your consultation hours?',
    status: 'Resolved',
    agent: 'Reception Bot',
    unread: 0,
  },
  {
    id: 'cv_6',
    name: 'Arjun Das',
    phone: '+91 91234 80077',
    email: 'arjun.das@example.com',
    channel: 'Phone',
    time: 'Mon',
    preview: 'Missed call — callback queued',
    status: 'Pending',
    agent: 'Triage Bot',
    unread: 0,
  },
  {
    id: 'cv_7',
    name: 'Meera Pillai',
    phone: '+91 93450 12876',
    email: 'meera.pillai@example.com',
    channel: 'Email',
    time: 'Sun',
    preview: 'Report attached, thank you',
    status: 'Resolved',
    agent: 'Billing Bot',
    unread: 0,
  },
  {
    id: 'cv_8',
    name: 'Karthik Suresh',
    phone: '+91 80125 66390',
    email: 'karthik.s@example.com',
    channel: 'WhatsApp',
    time: 'Sun',
    preview: 'Is Dr. Chen available Friday?',
    status: 'Resolved',
    agent: 'Reception Bot',
    unread: 0,
  },
]

export const messagesByConversation = {
  cv_1: [
    { id: 'm1', role: 'customer', author: 'Anita Kumar', time: '10:18', text: 'Hi, I’d like to book a cardiology appointment this week.' },
    { id: 'm2', role: 'agent', author: 'Reception Bot', time: '10:18', text: 'Happy to help. Dr. Michael Chen has openings on Thursday at 14:30 and Friday at 09:00. Which would you prefer?' },
    { id: 'm3', role: 'tool', text: 'check_appointment_availability · 240 ms' },
    { id: 'm4', role: 'customer', author: 'Anita Kumar', time: '10:22', text: 'Thursday at 2:30 works.' },
    { id: 'm5', role: 'agent', author: 'Reception Bot', time: '10:23', text: 'Booked — Dr. Michael Chen, Thursday 19 September at 14:30. A confirmation has been sent to +91 93602 35499.' },
    { id: 'm6', role: 'tool', text: 'book_appointment · 512 ms' },
    { id: 'm7', role: 'customer', author: 'Anita Kumar', time: '10:24', text: 'Perfect, thank you!' },
  ],
}

export const customerByConversation = {
  cv_1: {
    id: 'CUS-48120',
    name: 'Anita Kumar',
    since: '12 March 2026',
    tags: ['Repeat patient', 'Cardiology', 'Opted in — WhatsApp'],
    details: [
      { label: 'Customer ID', value: 'CUS-48120', mono: true },
      { label: 'Full name', value: 'Anita Kumar' },
      { label: 'Phone', value: '+91 93602 35499', mono: true },
      { label: 'Email', value: 'anita.kumar@example.com' },
      { label: 'Preferred channel', value: 'WhatsApp' },
      { label: 'Language', value: 'English' },
      { label: 'Location', value: 'Chennai, India' },
      { label: 'Timezone', value: 'Asia/Kolkata (UTC+5:30)', mono: true },
      { label: 'Acquired via', value: 'Inbound — WhatsApp' },
    ],
    stats: [
      { label: 'CONVERSATIONS', value: '14' },
      { label: 'CALLS', value: '6' },
      { label: 'AVG RESOLUTION', value: '4m 12s' },
      { label: 'TOKENS USED', value: '48.2K' },
    ],
    sentiment: 'Positive',
    lastContacted: 'Today, 10:24',
  },
}

const call = (
  startedAt, direction, from, to, agent, campaign, outcome,
  ringingAt, answeredAt, endedAt, duration, sentiment, cost, recording, flagged,
) => ({ startedAt, direction, from, to, agent, campaign, outcome, ringingAt, answeredAt, endedAt, duration, sentiment, cost, recording, flagged })

export const calls = [
  call('17 Sep 10:18', 'Inbound', '+91 93602 35499', '+91 44 4012 8800', 'Reception Bot', 'Inbound — main', 'Booked', '10:18:02', '10:18:09', '10:24:41', '6m 32s', 'Positive', '₹18.40', '6:32', true),
  call('17 Sep 09:52', 'Outbound', '+91 44 4012 8800', '+91 98407 11234', 'Recall Bot', 'Sep recalls', 'No answer', '09:52:04', null, '09:52:38', null, 'Neutral', '₹2.10', null, false),
  call('17 Sep 09:41', 'Inbound', '+91 98765 43210', '+91 44 4012 8800', 'Reception Bot', 'Inbound — main', 'Resolved', '09:41:11', '09:41:15', '09:45:02', '3m 47s', 'Positive', '₹10.90', '3:47', false),
  call('17 Sep 09:20', 'Outbound', '+91 44 4012 8800', '+91 99401 55621', 'Recall Bot', 'Sep recalls', 'Voicemail', '09:20:01', '09:20:08', '09:20:52', '44s', 'Neutral', '₹3.20', '0:44', false),
  call('17 Sep 08:57', 'Inbound', '+91 90031 77482', '+91 44 4012 8800', 'Triage Bot', 'Inbound — main', 'Transferred', '08:57:33', '08:57:36', '09:02:19', '4m 43s', 'Negative', '₹13.60', '4:43', true),
  call('16 Sep 18:12', 'Inbound', '+91 87654 32190', '+91 44 4012 8800', 'Reception Bot', 'Inbound — main', 'Booked', '18:12:07', '18:12:12', '18:17:30', '5m 18s', 'Positive', '₹15.20', '5:18', false),
  call('16 Sep 17:44', 'Outbound', '+91 44 4012 8800', '+91 91234 80077', 'Outreach Bot', 'Health camp', 'Callback', '17:44:02', '17:44:10', '17:46:55', '2m 45s', 'Neutral', '₹8.10', '2:45', false),
  call('16 Sep 16:30', 'Inbound', '+91 93450 12876', '+91 44 4012 8800', 'Triage Bot', 'Inbound — main', 'Resolved', '16:30:19', '16:30:23', '16:36:04', '5m 41s', 'Positive', '₹16.30', '5:41', false),
  call('16 Sep 15:02', 'Outbound', '+91 44 4012 8800', '+91 99620 33410', 'Recall Bot', 'Sep recalls', 'Failed', '15:02:00', null, '15:02:06', null, 'Neutral', '₹0.00', null, false),
  call('16 Sep 14:21', 'Inbound', '+91 80125 66390', '+91 44 4012 8800', 'Reception Bot', 'Inbound — main', 'Booked', '14:21:44', '14:21:49', '14:28:12', '6m 23s', 'Positive', '₹18.00', '6:23', false),
  call('16 Sep 11:09', 'Outbound', '+91 44 4012 8800', '+91 97890 45512', 'Outreach Bot', 'Health camp', 'No answer', '11:09:03', null, '11:09:41', null, 'Neutral', '₹2.40', null, false),
]

export const agents = [
  { id: 'ag_1', name: 'Reception Bot', model: 'claude-opus-5', status: 'Active', channels: ['WhatsApp', 'Phone'], conversations: 5204, resolution: 0.86, description: 'Front-line booking and enquiries. Checks availability and books appointments.' },
  { id: 'ag_2', name: 'Triage Bot', model: 'claude-opus-5', status: 'Active', channels: ['Phone'], conversations: 2918, resolution: 0.74, description: 'Routes urgent calls, escalates to a human when symptoms need a clinician.' },
  { id: 'ag_3', name: 'Recall Bot', model: 'claude-sonnet-5', status: 'Active', channels: ['Phone', 'SMS'], conversations: 1640, resolution: 0.81, description: 'Outbound follow-ups for missed appointments and scheduled recalls.' },
  { id: 'ag_4', name: 'Outreach Bot', model: 'claude-sonnet-5', status: 'Active', channels: ['Phone', 'SMS'], conversations: 1112, resolution: 0.69, description: 'Campaign calls for health camps and seasonal screening drives.' },
  { id: 'ag_5', name: 'Billing Bot', model: 'claude-haiku-4-5', status: 'Active', channels: ['Email', 'WhatsApp'], conversations: 1006, resolution: 0.91, description: 'Answers invoice and payment questions, resends receipts on request.' },
  { id: 'ag_6', name: 'After-hours Bot', model: 'claude-haiku-4-5', status: 'Paused', channels: ['Phone', 'SMS', 'WhatsApp'], conversations: 600, resolution: 0.77, description: 'Takes messages outside clinic hours and queues callbacks for the morning.' },
]

export const phoneNumbers = [
  { number: '+91 44 4012 8800', label: 'Main reception', type: 'Landline', provider: 'Twilio', agent: 'Reception Bot', direction: 'In & out', conversations: 5204, status: 'Live' },
  { number: '+91 44 4012 8801', label: 'Triage line', type: 'Landline', provider: 'Twilio', agent: 'Triage Bot', direction: 'Inbound', conversations: 2918, status: 'Live' },
  { number: '+91 80 6799 2210', label: 'Recall outbound', type: 'Landline', provider: 'Exotel', agent: 'Recall Bot', direction: 'Outbound', conversations: 1640, status: 'Live' },
  { number: '+91 98450 22110', label: 'Campaign mobile', type: 'Mobile', provider: 'Exotel', agent: 'Outreach Bot', direction: 'Outbound', conversations: 1112, status: 'Live' },
  { number: '1800 123 4567', label: 'Toll-free help', type: 'Toll-free', provider: 'Twilio', agent: 'Reception Bot', direction: 'Inbound', conversations: 842, status: 'Live' },
  { number: '+91 44 4012 8802', label: 'Billing desk', type: 'Landline', provider: 'Twilio', agent: 'Billing Bot', direction: 'In & out', conversations: 604, status: 'Live' },
  { number: '+91 99001 33447', label: 'After-hours line', type: 'Mobile', provider: 'Plivo', agent: 'After-hours Bot', direction: 'Inbound', conversations: 318, status: 'Live' },
  { number: '+91 44 4012 8803', label: 'Overflow (new)', type: 'Landline', provider: 'Twilio', agent: null, direction: '—', conversations: 0, status: 'Pending' },
]
