import { Router } from 'express'
import { createHmac } from 'node:crypto'
import { requireAuth } from '../auth/session.ts'
import { credentialsFor, publicWorkspace, redact, type Credentials } from '../workspace.ts'

export const perfoxRouter: Router = Router()

/**
 * The proxy, per user.
 *
 * Every route here is behind requireAuth and resolves the caller's own
 * workspace before touching Perfox. Two users signed in at once reach two
 * different workspaces through the same URL, and neither browser ever holds a
 * credential.
 */

const ID = '[0-9a-f-]{20,40}'

/**
 * Exactly what the frontend asks for, and nothing else.
 *
 * An allowlist rather than an open passthrough: this process holds a key that
 * can read and write everything in a workspace, and a signed-in user should
 * not be able to reach further through it than the app itself does.
 */
const READS = [
  /^agents$/,
  new RegExp(`^agents/${ID}$`),
  /^conversations$/,
  /**
   * One conversation, for the call panel.
   *
   * A call is over when its conversation is, and that is the only account of
   * it both sides agree on: the operator API's call_status answers null for a
   * call that finished and 404 for one its own session never handled.
   */
  new RegExp(`^conversations/${ID}$`),
  new RegExp(`^conversations/${ID}/events$`),
  new RegExp(`^conversations/${ID}/recordings$`),
  /^customers$/,
  new RegExp(`^customers/${ID}$`),
  /^calls$/,
  // The conversation log. Filters and paging are query parameters, which the
  // allowlist does not inspect — it decides which resource may be reached, not
  // how it is queried.
  /^cases$/,
  /^analytics\/summary$/,
  /^analytics\/conversations-over-time$/,
  /^billing\/credits$/,

  /**
   * Connected numbers and addresses, for the Phone Numbers page.
   *
   * `credentials` being on an allowlist is worth justifying, because the name
   * sounds like the last thing a proxy should forward. It returns metadata
   * only — id, name, type, status, and the *names* of the fields a credential
   * has, never their values. No secret is reachable through it, and it is the
   * only way to learn which credentials to ask for resources.
   *
   * `{id}/resources` needs the `credentials:read` scope on the workspace key.
   * A key minted with `settings:read` answers 403 here, which is the scope
   * change that went live with this endpoint.
   */
  /^credentials$/,
  new RegExp(`^credentials/${ID}/resources$`),
]

/** Anything that changes state is named explicitly, method included. */
const WRITES = [
  { method: 'POST', re: new RegExp(`^agents/${ID}/publish$`) },
  { method: 'PATCH', re: new RegExp(`^agents/${ID}$`) },
  { method: 'POST', re: /^outbound$/ },
]

perfoxRouter.use('/perfox', requireAuth)

perfoxRouter.all('/perfox/*splat', async (req, res) => {
  const creds = await credentialsFor(req.user!)

  if (!creds?.apiBase || !creds.apiToken) {
    res.status(503).json({
      error: 'This workspace has no Perfox connection configured yet.',
    })
    return
  }

  // Express 5 hands a multi-segment wildcard back as an array of segments, so
  // "analytics/summary" arrives as ["analytics","summary"]. Stringifying that
  // directly yields "analytics,summary", which matches no pattern below and
  // 403s every nested path while the single-segment ones work — a failure that
  // looks like a permissions problem and is not.
  const splat = req.params.splat
  const resource = Array.isArray(splat) ? splat.join('/') : String(splat ?? '')
  const isRead = req.method === 'GET' && READS.some((re) => re.test(resource))
  const isWrite = WRITES.some((w) => w.method === req.method && w.re.test(resource))

  if (!isRead && !isWrite) {
    res.status(403).json({ error: 'That operation is not available.' })
    return
  }

  const url = new URL(req.originalUrl, 'http://placeholder')
  const target = `${creds.apiBase}/${resource}${url.search}`

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        // The one place the key is used, and it never leaves this process.
        authorization: `Bearer ${creds.apiToken}`,
        'content-type': 'application/json',
      },
      body: isWrite ? JSON.stringify(req.body ?? {}) : undefined,
    })

    const text = await upstream.text()
    res
      .status(upstream.status)
      .set('content-type', upstream.headers.get('content-type') ?? 'application/json')
      .set('cache-control', 'no-store')
      .send(redact(text, creds))
  } catch (err) {
    console.error('[perfox]', redact((err as Error).message, creds))
    res.status(502).json({ error: 'Could not reach the workspace.' })
  }
})

/* ── operator calling ────────────────────────────────────── */

const sign = (c: Credentials, externalId: string): string =>
  createHmac('sha256', c.operator.siteSecret!)
    .update(`${c.operator.siteId}.${externalId}`)
    .digest('hex')

/**
 * The signed identity the operator SDK needs.
 *
 * The external id is derived from the signed-in user, never taken from the
 * request: if a client could name its own, it could sign in as any operator on
 * the workspace's site. The site secret is what makes that signature trusted,
 * so it stays here and is never part of the response.
 */
perfoxRouter.get('/operator/config', requireAuth, async (req, res) => {
  const user = req.user!
  const creds = await credentialsFor(user)
  const { callingConfigured } = publicWorkspace(creds)

  if (!creds || !callingConfigured) {
    // 200, not 503. "Not configured" is a true answer to "what is the
    // config?", and a non-2xx would have the browser log an error on every
    // page load of a workspace that simply does not have calling set up.
    res.json({
      configured: false,
      reason: 'Operator calling is not set up for this workspace.',
    })
    return
  }

  const externalId = `op_${user.id}`
  res.json({
    configured: true,
    apiHost: creds.operator.apiHost,
    siteId: creds.operator.siteId,
    workflowId: creds.operator.workflowId || null,
    operator: { externalId, name: user.name, userHash: sign(creds, externalId) },
  })
})

/**
 * Ending a call, and not letting go until the platform agrees it ended.
 *
 * The SDK ends one with `void this.req("session/stop", ...)` — not awaited,
 * not retried, no catch — and marks it ended locally on the next line. When
 * that request fails the operator sees a closed panel and the customer keeps
 * a live line, which is the complaint this exists to answer.
 *
 * Answering it needs a server, not better browser code. The stop has to
 * outlive the tab that asked for it, and the operator API refuses a request
 * whose origin is not on the site's allowed list, which is why this forwards
 * the one the browser sent.
 *
 * It retries because a single stop proves nothing: the platform answers
 * `{"ok":true}` to a session id that does not exist. The conversation going
 * `ended` is the only evidence that anything happened, so that is what is
 * waited for, and what is reported back.
 */
const STOP_ATTEMPTS = 4
const STOP_GAP_MS = 1500

const rest = async (creds: Credentials, path: string): Promise<unknown> => {
  const upstream = await fetch(`${creds.apiBase}/${path}`, {
    headers: { authorization: `Bearer ${creds.apiToken}`, accept: 'application/json' },
    signal: AbortSignal.timeout(4000),
  })
  return upstream.ok ? await upstream.json().catch(() => null) : null
}

perfoxRouter.post('/operator/stop', requireAuth, async (req, res) => {
  const user = req.user!
  const creds = await credentialsFor(user)
  const { callingConfigured } = publicWorkspace(creds)
  const conversationId = String(req.body?.conversationId ?? '')
  const sessionId = String(req.body?.sessionId ?? '')

  if (!creds || !callingConfigured) {
    res.status(409).json({ ended: false, reason: 'Operator calling is not set up.' })
    return
  }
  if (!new RegExp(`^${ID}$`).test(conversationId)) {
    res.status(400).json({ ended: false, reason: 'A conversation id is required.' })
    return
  }

  const externalId = `op_${user.id}`
  // The browser's own origin, which is the one the site already allows. A
  // beacon from a closing tab sends it too.
  const origin = req.headers.origin ?? `${req.protocol}://${req.get('host')}`

  const stop = async (): Promise<void> => {
    if (!sessionId) return
    await fetch(`${creds.operator.apiHost}/api/public/operator/session/stop`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Perfox-Site': creds.operator.siteId!,
        origin,
      },
      body: JSON.stringify({
        operator: {
          external_id: externalId,
          name: user.name,
          user_hash: sign(creds, externalId),
        },
        session_id: sessionId,
      }),
      signal: AbortSignal.timeout(4000),
    })
  }

  const isOver = async (): Promise<boolean> => {
    const body = (await rest(creds, `conversations/${conversationId}`)) as
      | { status?: string; data?: { status?: string } }
      | null
    return (body?.data?.status ?? body?.status) === 'ended'
  }

  for (let attempt = 1; attempt <= STOP_ATTEMPTS; attempt++) {
    try {
      await stop()
      if (await isOver()) {
        res.json({ ended: true, attempts: attempt })
        return
      }
    } catch (err) {
      console.error('[perfox] stop', redact((err as Error).message, creds))
    }
    if (attempt < STOP_ATTEMPTS) await new Promise((done) => setTimeout(done, STOP_GAP_MS))
  }

  // Reported, not hidden. A line still open after this is worth knowing about.
  console.error(`[perfox] stop: ${conversationId} did not end after ${STOP_ATTEMPTS} attempts`)
  res.json({ ended: false, attempts: STOP_ATTEMPTS })
})


/* ── what the shell needs to describe itself ─────────────── */

perfoxRouter.get('/config', requireAuth, async (req, res) => {
  const creds = await credentialsFor(req.user!)
  res.json(publicWorkspace(creds))
})
