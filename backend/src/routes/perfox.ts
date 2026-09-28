import express, { Router } from 'express'
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
 * The knowledge base names its own ids, and the platform does not document
 * their shape — only "Resource id." So this is wider than ID on purpose,
 * and narrow where it counts: no slash and no dot, so nothing matched here
 * can climb out of the resource it names.
 */
const KB_ID = '[A-Za-z0-9_-]{8,64}'

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
  new RegExp(`^conversations/${ID}/events$`),
  new RegExp(`^conversations/${ID}/recordings$`),
  /^customers$/,
  new RegExp(`^customers/${ID}$`),

  /**
   * A customer's own page.
   *
   * `details` is the workspace counting for us — conversations, channels,
   * first and last seen, and how those conversations ended. The console
   * used to work some of that out in the browser from whatever page of
   * conversations it happened to hold, which is a smaller number than the
   * truth and reads exactly like the truth.
   */
  new RegExp(`^customers/${ID}/details$`),
  new RegExp(`^customers/${ID}/conversations$`),
  /^calls$/,
  // The conversation log. Filters and paging are query parameters, which the
  // allowlist does not inspect — it decides which resource may be reached, not
  // how it is queried.
  /^cases$/,
  /^analytics\/summary$/,
  /^analytics\/conversations-over-time$/,
  /^billing\/credits$/,

  /**
   * The knowledge base, for the Documents page.
   *
   * A file's own row is readable because an upload comes back `pending` and
   * has to be polled until it is `indexed` — the platform says so itself.
   */
  /^kb\/files$/,
  new RegExp(`^kb/files/${KB_ID}$`),
  /^kb\/folders$/,

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

  // Documents. The upload itself is not here: it carries a file rather than
  // JSON, and has a route of its own below.
  { method: 'DELETE', re: new RegExp(`^kb/files/${KB_ID}$`) },
  { method: 'POST', re: new RegExp(`^kb/files/${KB_ID}/move$`) },
  { method: 'POST', re: /^kb\/folders$/ },
  { method: 'PATCH', re: new RegExp(`^kb/folders/${KB_ID}$`) },
  { method: 'DELETE', re: new RegExp(`^kb/folders/${KB_ID}$`) },
]

/**
 * Uploading a document.
 *
 * Its own route because the proxy below re-encodes what it forwards as
 * JSON, and a multipart body cannot survive that: the boundary in the
 * content-type has to match the bytes, so both are passed through as they
 * arrived.
 *
 * express.json ignores multipart, so nothing has consumed the body by the
 * time this runs. The limit is this route's own — the 1mb the rest of the
 * app uses would refuse most documents worth indexing.
 */
const UPLOAD_LIMIT = '25mb'

perfoxRouter.post(
  '/perfox/kb/files',
  requireAuth,
  express.raw({ type: 'multipart/form-data', limit: UPLOAD_LIMIT }),
  async (req, res) => {
    const creds = await credentialsFor(req.user!)
    if (!creds?.apiBase || !creds.apiToken) {
      res.status(503).json({ error: 'This workspace has no Perfox connection configured yet.' })
      return
    }

    const contentType = req.get('content-type')
    if (!contentType?.startsWith('multipart/form-data')) {
      res.status(415).json({ error: 'A document upload must be multipart/form-data.' })
      return
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'No document was received.' })
      return
    }

    try {
      const upstream = await fetch(`${creds.apiBase}/kb/files`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${creds.apiToken}`,
          // The boundary lives in here. Rewriting it would make the body
          // unreadable at the other end.
          'content-type': contentType,
        },
        body: req.body,
      })
      const text = await upstream.text()
      res
        .status(upstream.status)
        .set('content-type', upstream.headers.get('content-type') ?? 'application/json')
        .set('cache-control', 'no-store')
        .send(redact(text, creds))
    } catch (err) {
      console.error('[perfox] upload', redact((err as Error).message, creds))
      res.status(502).json({ error: 'Could not reach the workspace.' })
    }
  },
)

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

/* ── what the shell needs to describe itself ─────────────── */

perfoxRouter.get('/config', requireAuth, async (req, res) => {
  const creds = await credentialsFor(req.user!)
  res.json(publicWorkspace(creds))
})
