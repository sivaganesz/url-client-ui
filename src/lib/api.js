/**
 * Talks only to this site's own backend, which has already removed anything
 * technical. There is no workspace key, no MCP surface and no vendor endpoint
 * reachable from here.
 */
async function get(path) {
  const res = await fetch(path)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? 'Could not load this right now.')
  return body
}

export const getOverview = () => get('/api/overview')
export const getConversations = () => get('/api/conversations').then((r) => r.conversations)
export const getConversation = (id) => get(`/api/conversations/${id}`)
export const getCustomers = () => get('/api/customers').then((r) => r.customers)
export const getChannels = () => get('/api/channels')
export const getAssistants = () => get('/api/assistants').then((r) => r.assistants)
