# Operator connector — integration guide

How to give a web app **live, two-way operator calling** using the Perfox
operator SDK (`@perfox/operator-react`).

This is written to be followed in a project that has none of it yet. It
documents how calling works in this app (`client-ui`), and the decisions worth
copying or reconsidering. Code samples are complete enough to paste.

Current against **SDK 0.1.1**.

---

## 1. What the Operator is

The Operator connector puts **a human being on the phone call, inside the
browser**. Audio runs over WebRTC; the person wearing the headset talks to the
customer directly, with mute, hold, transfer and hang-up acting on the real
audio stream.

It is worth being precise about this, because a platform like Perfox has two
different things that both look like "making a call":

| | Agent outbound | **Operator** |
|---|---|---|
| Who talks to the customer | the AI agent | **a human, in the browser** |
| Where the audio lives | on the platform | **the browser's microphone and speakers** |
| What the API call is | `POST /outbound` | `POST /api/public/operator/call_outbound` |
| What the browser gets back | a conversation id | **a LiveKit room + token** |
| Can Mute / Hold / Transfer do anything? | no — there is no local audio | **yes** |
| Authorised by | the workspace API key | **a site key + a server-signed `user_hash`** |

**A call panel built on agent outbound cannot work.** It looks right — a call
really is placed, a conversation really is created — but the operator is never
on the line, so the panel's controls have nothing to control. Mute, hold and
transfer need a local audio stream to act on, and only the operator surface
gives you one.

### Why use it

- **Mute / hold / transfer / hang-up actually work**, because there is a local
  audio stream to act on.
- **The status is the platform's, not a guess.** `dialing → ringing → live →
  ended` comes from the call itself, so the UI never has to invent state.
- **You get the copilot surfaces for free.** The same session exposes live
  transcript, AI whispers, operator Ask-AI, compliance flags and a post-call
  summary — you choose which to render. See §10.
- **The secret never reaches the browser.** Identity is signed server-side, so
  a user cannot impersonate another operator by editing a request.

---

## 2. How it works

```
Browser                          Your backend                 Perfox tenant
   │                                  │                             │
   │  GET /api/operator/config        │                             │
   ├─────────────────────────────────►│                             │
   │                                  │ user_hash = HMAC_SHA256(    │
   │                                  │   site_secret,              │
   │                                  │   "<siteId>.<externalId>")  │
   │  { apiHost, siteId, workflowId,  │                             │
   │    operator:{externalId, name,   │                             │
   │              userHash} }         │                             │
   │◄─────────────────────────────────┤                             │
   │                                                                │
   │  POST /api/public/operator/call_outbound                       │
   │  X-Perfox-Site: <siteId>   body: { operator:{…}, phone_number } │
   ├───────────────────────────────────────────────────────────────►│
   │  ◄── conversation_id, call_id                                  │
   │  …poll answer/ until { livekit_url, token }                    │
   │  POST session/start ──► { session_id, ws_ticket }              │
   │                                                                │
   │  ══ WebRTC audio (LiveKit) ════════════════════════════════════│
   │  ══ WebSocket /api/public/operator/stream (transcript, AI) ════│
```

The **site secret is the trust anchor**. The platform will not open an operator
session for an unsigned identity, so the app needs a server that holds the
secret and signs on behalf of a logged-in user. That server requirement is not
optional — it is the reason a pure static frontend cannot do this alone.

### The signature

```
user_hash = HMAC_SHA256(site_secret, "<siteId>.<externalId>")   // hex
```

Two rules:

1. **`externalId` must come from the server**, derived from the session — never
   from a request body or query string. If a client can name its own
   `externalId`, it can sign in as any operator.
2. **`siteId` in the hash must match the `X-Perfox-Site` header.** If they
   disagree the platform answers `operator_signature_required`, which reads
   like a bad secret but usually means a mismatched site (see §9).

---

## 3. Prerequisites

**On the Perfox side** (Studio → Sites), you need a site that is:

- **operator-enabled** — a normal site will not do; the toggle is separate
- carrying your app's **origin in `allowed_origins`** — on the site **and on
  the operator node**. Both are required.

**In the project:**

- React **18 or newer** (peer dependency). This app is on 19.
- A **server-side component** that can hold a secret — Node, Python, Go, a
  serverless function, anything. It needs one endpoint (§6)
- The SDK tarball. `@perfox/operator-react` is **not on npm**; it ships as a
  file and is installed with a `file:` dependency
- **A secure context for the microphone.** `getUserMedia` requires HTTPS.
  `localhost` is exempt, so dev works over plain HTTP, but any other host —
  including a LAN IP like `192.168.1.5:5180` — silently fails to get a mic
  until it is served over HTTPS

**To actually hear anything**, a real phone call has to reach the workflow.
Presence, dialling and the conversation list all work without one; audio,
transcript and whispers do not.

---

## 4. Configuration

### Values to collect

| Key | Example | Where it comes from | Secret? |
|---|---|---|---|
| API host | `https://acme-api.perfox.ai` | your tenant's API host | no |
| Site ID | `sa_site_live_xxxx…` | Studio → Sites, an **operator-enabled** site | no |
| Site secret | `sa_secret_live_xxxx…` | the same site | **YES — server only** |
| Workflow ID | `01a0c809-70dc-76b5-…` (a UUID) | the copilot workflow | no |

**Who the operator is comes from the signed-in user**, not from configuration
— see §6.

In this app these four values are stored per workspace in the database,
encrypted at rest, and entered through the admin UI. A single-tenant project
would hold them in server-side environment variables instead.

Notes:

- **The site keys are a different credential from your workspace/API key.** A
  workspace key does not authorise the operator surface and the site secret
  does not authorise the REST API. Both can be present and unrelated.
- The workflow ID may be blank — it then falls back to the tenant's default
  agent. Set it if you want a specific copilot.
- The site secret belongs in server-side storage only. It must not appear in a
  client bundle, a `VITE_`/`NEXT_PUBLIC_` variable, or a committed file. Add it
  to whatever your logger redacts.

### Origins

Add every origin the app is served from, exactly, to the site **and** the
operator node:

```
http://localhost:5180          ← dev (this project's Vite port)
https://console.example.com    ← production
```

Scheme included, no trailing slash, and `localhost` is **not** the same as
`127.0.0.1` — list both if you use both.

---

## 5. Step 1 — install the SDK

```bash
mkdir -p vendor
cp /path/to/perfox-operator-react-0.1.1.tgz vendor/
```

```jsonc
// package.json
"dependencies": {
  "@perfox/operator-react": "file:vendor/perfox-operator-react-0.1.1.tgz"
}
```

```bash
npm install
```

This pulls in `livekit-client` (~560 kB) as a transitive dependency. The SDK
imports it **dynamically**, so a bundler splits it into its own chunk and it is
only downloaded when a call actually starts. Do not force it into the main
bundle.

### Updating to a new tarball

```bash
# 1. new .tgz into vendor/, update the path in package.json
npm install
# 2. clear Vite's pre-bundled copy, then restart the dev server
rm -rf node_modules/.vite
```

Step 2 is required. A running Vite pre-bundles dependencies at startup and
keeps serving that copy after `npm install` replaces the files on disk, so the
browser runs the previous version while the source on disk is the new one.

---

## 6. Step 2 — the signing endpoint

One endpoint. It returns the public site config plus a signed identity, and
never the secret.

```js
// server — Node, zero dependencies beyond node:crypto
import { createHmac } from 'node:crypto'

const signOperator = (siteId, secret, externalId) =>
  createHmac('sha256', secret).update(`${siteId}.${externalId}`).digest('hex')

// GET /api/operator/config
function operatorConfig(req, res) {
  const site = configFor(req.user)          // env, or a row per tenant
  if (!site?.apiHost || !site.siteId || !site.secret) {
    // 200, not 503: "not configured" is a true answer to "what is the config?",
    // and a non-2xx has the browser log an error on every page load of a
    // workspace that simply does not have calling set up.
    return res.json({ configured: false, reason: 'Operator calling is not set up.' })
  }

  // ▼ THE IMPORTANT LINE — derive identity from the session, never the request.
  const externalId = `op_${req.user.id}`

  res.json({
    configured: true,
    apiHost: site.apiHost,
    siteId: site.siteId,
    workflowId: site.workflowId || null,
    operator: {
      externalId,
      name: req.user.name,
      userHash: signOperator(site.siteId, site.secret, externalId),
    },
  })
}
```

The response shape is deliberately the SDK's `config` object, so it drops
straight into the provider with no remapping.

**Every signed-in user is their own operator.** `op_<user id>` is stable for
that account and unguessable by another, which is what keeps two people from
contending over one presence.

### If your app has no login

Signing one fixed identity from configuration works, but be clear about what it
means: **every browser that opens the app is the same operator.** Two tabs are
one operator and will contend over presence; an inbound call could ring either.
Acceptable for a single-seat console, and the first thing to fix when the app
gets real users.

A middle option is a stable per-session id backed by a cookie, which at least
keeps two browsers distinct — though the operators remain anonymous.

### In another language

The HMAC is trivial to port; only the string format matters.

```python
hmac.new(secret.encode(), f"{site_id}.{external_id}".encode(), hashlib.sha256).hexdigest()
```

```java
Mac m = Mac.getInstance("HmacSHA256");
m.init(new SecretKeySpec(secret.getBytes(UTF_8), "HmacSHA256"));
String hash = HexFormat.of().formatHex(m.doFinal((siteId + "." + externalId).getBytes(UTF_8)));
```

---

## 7. Step 3 — mount the SDK

`useOperator()` throws outside `<OperatorProvider>`, and the provider cannot
mount until the config has been fetched. So put a gate in front of it that
always renders children, and expose your own hook that never throws — pages can
then call it unconditionally and show *why* calling is unavailable instead of
crashing.

```jsx
// src/lib/operator.jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { OperatorProvider, useOperator } from '@perfox/operator-react'

const CallContext = createContext(null)

export function useCall() {
  return useContext(CallContext) ?? { ready: false, reason: 'Operator calling is not mounted.' }
}

export function OperatorGate({ children }) {
  const [config, setConfig] = useState(null)
  const [reason, setReason] = useState('Connecting to the operator service…')

  useEffect(() => {
    let live = true
    fetch('/api/operator/config')
      .then((r) => r.json())
      .then((c) => {
        if (!live) return
        if (c.configured) setConfig(c)
        else setReason(c.reason)
      })
      .catch(() => live && setReason('The operator service could not be reached.'))
    return () => { live = false }
  }, [])

  if (!config) {
    return <CallContext.Provider value={{ ready: false, reason }}>{children}</CallContext.Provider>
  }
  return (
    <OperatorProvider config={config}>
      <CallBridge>{children}</CallBridge>
    </OperatorProvider>
  )
}
```

### Placing and ending a call

```jsx
function CallBridge({ children }) {
  const op = useOperator()
  const { dialOut, hold, hangup, setMicEnabled, session } = op
  const active = op.activeCall

  // The SDK does not track WHO you are calling — activeCall has ids and status
  // but no name or number, and the panel needs both from the click onward.
  const [party, setParty] = useState(null)
  const [dialing, setDialing] = useState(false)

  const dial = useCallback(async ({ name, phone }) => {
    const digits = String(phone ?? '').replace(/[^\d+]/g, '')
    if (!digits) throw new Error('No phone number to dial.')
    setParty({ name: name || digits, phone: digits })
    setDialing(true)
    try { await dialOut(digits) } finally { setDialing(false) }

    // dialOut REPORTS FAILURE IN STATE, NOT BY THROWING. Read the outcome back
    // or callers will announce a call that never happened. Checking activeCall
    // alone is not enough: when nobody answers, the SDK sets `error` and leaves
    // activeCall at 'dialing'. The error is the reliable signal.
    const s = session.getState()
    if (!s.activeCall || s.activeCall.status === 'ended' || s.error) {
      setParty(null)
      throw new Error(s.error ?? 'The call could not be connected.')
    }
  }, [dialOut, session])

  const end = useCallback(async () => {
    // Read the ids BEFORE hanging up — hangup() clears the session on its way
    // out, and the server call below is addressed to the session it forgets.
    const current = session.getState().activeCall
    const conversationId = current?.conversationId ?? null
    const sessionId = current?.sessionId ?? ''
    const answered = current?.status === 'live'

    await hangup()
    setParty(null)

    if (conversationId) stopOnServer(conversationId, sessionId, answered)
  }, [hangup, session])

  /* … */
}
```

**What `hangup()` does.** It stops the local audio, and if the call is still
dialing or ringing it also calls `cancel_call` with Plivo's `call_id` — the
request id, which is the only id that stops a phone ringing before pickup, and
which exists only inside the SDK. Once the call is answered there is a room to
leave and a session to stop instead.

**Treat `end()` as destructive.** It really ends the call, at any stage. Do not
call it speculatively from a poll, a reconciliation loop or a cleanup effect
unless you are certain the call is over — on a ringing call it hangs up on a
customer whose phone is still ringing.

**Why there is a server call as well.** `hangup()` fires `session/stop` without
awaiting it, without retrying, and marks the call ended locally on the next
line. If that request fails, the operator sees a closed panel while the
customer keeps a live line. A server route that retries, then confirms the
conversation actually reached `ended`, is the difference between "we asked" and
"it stopped".

```js
// Sends the same body either way. `beacon` is for a page that is going away:
// sendBeacon is the one request a closing tab is allowed to finish, and there
// the SDK's hangup never gets to run at all.
function stopOnServer(conversationId, sessionId, answered, beacon = false) {
  const body = JSON.stringify({ conversationId, sessionId, answered })
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon('/api/operator/stop', new Blob([body], { type: 'application/json' }))
    return
  }
  void fetch('/api/operator/stop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}
```

Call it again from a `pagehide` listener, with `beacon = true`. A tab closing
mid-call otherwise leaves the customer holding a line to a browser that no
longer exists.

Mount the gate **above your router outlet**, not inside a page, so a call
survives navigation:

```jsx
export default function AppShell() {
  return (
    <OperatorGate>
      <div className="app">
        <Sidebar />
        <Outlet />
        <CallPanel />   {/* also here, so it outlives the page that placed the call */}
      </div>
    </OperatorGate>
  )
}
```

---

## 8. Step 4 — wire it into the UI

### 8a. A settings screen — configure and verify

Someone should be able to confirm the connector is live *before* they are on a
call with a customer. Surface the config the browser is allowed to see, plus a
reachability check.

```jsx
function CallSettings() {
  const { ready, reason } = useCall()
  const [cfg, setCfg] = useState(null)

  useEffect(() => {
    fetch('/api/operator/config').then((r) => r.json()).then(setCfg).catch(() => {})
  }, [])

  return (
    <section>
      <h2>Operator connector</h2>
      <StatusRow tone={ready ? 'ok' : 'warn'}
                 label={ready ? 'Connected' : 'Not connected'}
                 detail={ready ? null : reason} />
      <dl>
        <dt>API host</dt>      <dd>{cfg?.apiHost ?? '—'}</dd>
        <dt>Site ID</dt>       <dd><code>{cfg?.siteId ?? '—'}</code></dd>
        <dt>Workflow</dt>      <dd>{cfg?.workflowId ?? 'Tenant default agent'}</dd>
        <dt>Signed in as</dt>  <dd>{cfg?.operator?.name} (<code>{cfg?.operator?.externalId}</code>)</dd>
        <dt>Microphone</dt>    <dd>{window.isSecureContext ? 'Available' : 'Blocked — needs HTTPS'}</dd>
      </dl>
    </section>
  )
}
```

**Do not put the site secret on this screen, or an input that accepts one.**
The endpoint deliberately never returns it; a settings form that posts a secret
from the browser hands it to anyone with devtools. Secrets change server-side,
not in the UI.

### 8b. The call trigger

**Drive the button from the call, not from the `dial()` promise.** `dial()`
settles when the SDK's dial loop stops, which is not the same moment the
operator hangs up. The call in context disappears the instant the call ends, in
every case — hang-up from this button, from the panel, or the call failing —
so it is the signal that keeps the button honest.

```jsx
function CallButton({ customer }) {
  const { dial, end, call, ready, reason } = useCall()
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState(null)

  const onThisCall = Boolean(call && digitsOf(call.phone) === digitsOf(customer.phone))

  // Waiting to have SEEN a call first matters: for the tick between the click
  // and the panel opening there is no call yet, and clearing on that would
  // undo the click.
  const hadCall = useRef(false)
  useEffect(() => {
    if (onThisCall) { hadCall.current = true; return }
    if (!hadCall.current) return
    hadCall.current = false
    setCalling(false)
  }, [onThisCall])

  const blocked = !customer.phone ? 'No phone number'
    : !ready ? reason
    : call && !onThisCall ? 'You are already on a call'
    : null

  async function placeCall() {
    setCalling(true); setError(null)
    try {
      await dial({ name: customer.name, phone: customer.phone })
    } catch (err) {
      setError(err.message)     // works because dial() re-throws — see §7
    } finally {
      setCalling(false)
    }
  }

  return (
    <button disabled={onThisCall ? false : Boolean(blocked) || calling}
            title={blocked ?? `Call ${customer.phone}`}
            onClick={() => (onThisCall ? void end() : placeCall())}>
      {onThisCall ? 'End Call' : calling ? 'Calling…' : 'Call'}
    </button>
  )
}
```

**Gate on the right things:** a phone number exists, the connector is ready,
and no *other* call is already up. An agent's phone trigger has no say — the
operator places the call through the site, not through the agent.

**Wording matters.** Tell the user *they* are calling and that their microphone
goes live on pickup — people should not be surprised by an open mic.

### 8c. The call panel

```jsx
function CallPanel() {
  const { call, error, end, hold, mute } = useCall()
  if (!call) return null

  const live = call.status === 'live'
  const label = call.onHold ? 'On hold'
    : { dialing: 'Calling…', ringing: 'Ringing…', live: 'In call', ended: 'Ended' }[call.status]

  return (
    <div role="dialog" aria-label={`Call with ${call.name}`}>
      <strong>{call.name}</strong>
      <span>{call.phone}</span>
      <span>{label}</span>
      {error && <p role="alert">{error}</p>}

      {/* Audio controls need a room to act on — disable until the call is up. */}
      <button disabled={!live} onClick={() => mute(!call.muted)}>
        {call.muted ? 'Unmute' : 'Mute'}
      </button>
      <button disabled={!live} onClick={() => hold(!call.onHold)}>
        {call.onHold ? 'Resume' : 'Hold'}
      </button>
      <button onClick={end}>End</button>
    </div>
  )
}
```

Three details that matter more than they look:

- **Start the duration timer on `live`**, not when the panel appears.
  Otherwise it counts ringing time and reads as a longer call than happened.
- **Reset it per `conversationId`**, or a second call continues the first's
  count.
- **`micEnabled` starts false and flips true only when the room connects**,
  while the SDK sets status `live` in `session/start`, which runs *before*
  `joinVoice` finishes. For a second or two at pickup the panel would say the
  operator is muted when they are not — at the one moment that matters most.
  Latch a separate "audio ready" flag the first time `micEnabled` goes true,
  and reset it per call.

---

## 9. Troubleshooting — the three gates

Each check fails with its own `403`, so the error body tells you which one. They
are evaluated in this order; fixing one reveals the next.

| Response | Meaning | Fix |
|---|---|---|
| `origin_not_allowed` | The `Origin` header is not on the site's list | Add the exact origin to **allowed_origins on the site AND on the operator node**. Both |
| `operator_not_enabled` | The site is not flagged for the operator SDK | Enable the operator SDK on the site in Studio → Sites. May be tenant/plan-gated |
| `operator_signature_required` | The `user_hash` did not verify | Usually **not** a bad secret: check that the site id and secret are from the *same* site, and that the `siteId` in the hash matches the `X-Perfox-Site` header |

A server-to-server request sends **no `Origin` header at all** and is refused
with `origin_not_allowed`. Send the header explicitly, as below.

Verify from the command line without touching the UI — `availability` with
`status: "away"` exercises all three gates and changes nothing:

```bash
CFG=$(curl -s --cookie "$SESSION" http://localhost:4300/api/operator/config)
SITE=$(echo "$CFG" | sed -n 's/.*"siteId":"\([^"]*\)".*/\1/p')
EXT=$(echo  "$CFG" | sed -n 's/.*"externalId":"\([^"]*\)".*/\1/p')
HASH=$(echo "$CFG" | sed -n 's/.*"userHash":"\([^"]*\)".*/\1/p')

curl -s -X POST "https://acme-api.perfox.ai/api/public/operator/availability" \
  -H "Content-Type: application/json" \
  -H "X-Perfox-Site: $SITE" \
  -H "Origin: http://localhost:5180" \
  -d "{\"operator\":{\"external_id\":\"$EXT\",\"name\":\"probe\",\"user_hash\":\"$HASH\"},\"status\":\"away\"}"
```

`{"ok":true}` means the connector is good and any remaining problem is in the
UI. Use the real origin of your app in the `Origin` header — that is the value
being tested.

### Other symptoms

| Symptom | Cause |
|---|---|
| Dial resolves, no audio, no error | Not a secure context — mic blocked. HTTPS, or use `localhost` |
| A stale error shows on a good call | The SDK clears `state.error` only in `setAvailability` and `openConversation`. If you call neither, track what you have shown and ignore it (§7) |
| A failed call reports success | `dialOut` does not throw — read `session.getState()` back (§7) |
| `dial: no answer` after ~30s | Nobody picked up; the SDK retries `answer` 30 × 1s |
| A call ends moments after dialling | Something is calling `end()` or `hangup()` while the call is still ringing (§7) |
| The browser behaves differently from the source on disk | Vite is serving its pre-bundled copy. `rm -rf node_modules/.vite` and restart (§5) |
| Operator drops out of routing after ~60s | Presence went stale. Only happens if you use inbound; the SDK heartbeats every 20s while `available` |

---

## 10. Reference

### `useOperator()` actions

```
setAvailability(status)        'available' | 'busy' | 'away'
dialOut(phone)                 outbound; resolves on pickup or gives up
answer(conversationId?)        accept a ringing call
decline()
hold(on)                       also mutes the local mic
transfer({ externalId, name })
hangup()                       ends a live call; cancels one still ringing
setMicEnabled(enabled)
ask(question)                  operator Ask-AI
transcribe(blob)               push-to-talk dictation
openConversation(id)           read-only history
loadConversations()
loadCustomerProfile(id)
setHelpMe / setVerbosity / setDisplayLanguage / logAction
session                        escape hatch — the underlying engine
```

### State worth rendering

```
connected, availability, activeCall {conversationId, status, onHold, direction},
incomingCall {…, directed, fromOperatorName}, micEnabled, error,
transcript[], whispers[], answers[], kb[], compliance, summary,
conversations[], customerPanel
```

`CallStatus` is `idle | dialing | ringing | live | ended`.

### Config options

| Field | Required | Notes |
|---|---|---|
| `apiHost` | yes | tenant API host |
| `siteId` | yes | operator-enabled site |
| `operator` | yes | `{ externalId, name, userHash }` |
| `workflowId` | no | omit → tenant default agent |
| `mode` | no | `live_tap` (default), `dictation`, `third_actor` |
| `autoAvailable` | no | go available on mount. Default `false` |
| `ringPollMs` | no | default `2500`. **This app sets it to an hour** — see §11 |

### Endpoints the SDK calls

All `POST {apiHost}/api/public/operator/<route>`, header
`X-Perfox-Site: <siteId>`, body `{ operator: {external_id, name, user_hash}, …}`:

```
availability  pending  answer  decline  call_outbound  call_status  cancel_call
session/start  session/stop  hold  transfer  conversations  history
summary  customer_profile  operator_defaults  transcribe  log_action
```

Plus a WebSocket at `wss://…/api/public/operator/stream?…` for transcript and
AI events, and a LiveKit room for audio.

`cancel_call` is the only thing that stops a phone ringing before pickup —
`session/stop` does nothing to a call with no audio room. It takes the
conversation, and the `call_id` if you have it.

---

## 11. Decisions to make deliberately

These are judgement calls, not defaults. This app chose one way; another
project may want the other.

**Availability.** This app never goes `available`, deliberately. Going
available enrols the client in **inbound ring routing**, and there is no answer
UI here — a routed call would ring into a void. If you want inbound, you must
also build an incoming-call surface (`incomingCall`, `answer()`, `decline()`)
and keep the tab open, because presence goes stale ~60s after the heartbeat
stops.

**Ring polling runs regardless of availability.** The SDK starts it when the
session is constructed, so every signed-in user polls `pending` every 2.5
seconds (`ringPollMs`). *Queue* rings are suppressed while the operator is
unavailable or already on a call, but a **directed** ring — a warm transfer
aimed at one operator by name — is surfaced either way. An app with no answer
UI is therefore handed transfers it silently ignores, and the customer rings
out.

**This app sets `ringPollMs` to an hour**, which is as close to off as the SDK
allows: it ticks once when the session is constructed and then effectively not
again. There is no switch, and a value above roughly 24 days overflows
`setInterval` and fires continuously, so an hour rather than a year.

**Undo that first** if inbound calls or warm transfers are ever wanted. Both
arrive through this poll, and at an hour's interval a ringing call would be
noticed long after it stopped ringing.

Outbound numbers are checked before anything is dialled — see `dialProblem` in
`src/lib/operator.tsx`. A call never reaches the backend, so that is the only
place a number can be refused before a telephone rings somewhere.

If that matters, either build the answer surface or call `decline()` on any
incoming ring, so the transferring operator learns immediately. This app
knowingly does neither: nothing routes to it, because no operator here is ever
marked available.

**Identity.** `op_<user id>`, derived from the session. Anything with real
users should do the same — see §6.

**Where the conversation lives.** A call opens **its own conversation** on the
platform — it is a session with its own recording, not a continuation of
whatever thread the button was pressed on. Say so in the UI; users otherwise
expect the call to be appended to the thread they were reading.

**What to render.** The session carries transcript, whispers, Ask-AI,
compliance and KB whether or not you display them. Adding them later is UI
work, not integration work — the data is already arriving.

**Bundle size.** `livekit-client` is ~560 kB. Keep it dynamically imported so
it loads on first call, not on first page view.
