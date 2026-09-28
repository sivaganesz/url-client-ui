# Operator connector — integration guide

How to give a web app **live, two-way operator calling** using the Perfox
operator SDK (`@perfox/operator-react`).

This is written to be followed in a project that has none of it yet. It
documents what was done in this app (`client-ui`), and the decisions worth
copying or reconsidering. Code samples are complete enough to paste.

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

**The most common mistake** is building a call panel on top of agent outbound.
It looks right — a call really is placed, a conversation really is created —
but the operator was never on the line, so the panel's controls have nothing to
control. That is exactly what this app had before the connector went in: the
`CallScreen` component carried the comment *"Mute and Hold are UI only for
now."* They are real now, and that is the whole difference.

### Why use it

- **Mute / hold / transfer / hang-up actually work**, because there is a local
  audio stream to act on.
- **The status is the platform's, not a guess.** `dialing → ringing → live →
  ended` comes from the call itself, so the UI can stop inventing state (this
  app previously showed "Calling…" for a hardcoded three seconds).
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
   │  ◄── conversation_id                                           │
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
   like a bad secret but is usually a mismatched site (see §8).

---

## 3. Prerequisites

**On the Perfox side** (Studio → Sites), you need a site that is:

- **operator-enabled** — a normal site will not do; the toggle is separate
- carrying your app's **origin in `allowed_origins`** — on the site **and on
  the operator node**. Both. Missing the second one is the single most common
  cause of a connector that "should work"

**In the project:**

- React **18 or newer** (peer dependency)
- A **server-side component** that can hold a secret — Node, Python, Go, a
  serverless function, anything. It needs one endpoint (§5)
- The SDK tarball. `@perfox/operator-react` is **not on npm**; it ships as a
  file and is installed with a `file:` dependency
- **A secure context for the microphone.** `getUserMedia` requires HTTPS.
  `localhost` is exempt, so dev works over plain HTTP, but any other host —
  including a LAN IP like `192.168.1.5:5190` — silently fails to get a mic
  until it is served over HTTPS

**To actually hear anything**, a real phone call has to reach the workflow.
Presence, dialling and the conversation list all work without one; audio,
transcript and whispers do not.

---

## 4. Configuration

### Values to collect

| Key | Example | Where it comes from | Secret? |
|---|---|---|---|
| `OPERATOR_API_HOST` | `https://acme-api.perfox.ai` | your tenant's API host | no |
| `OPERATOR_SITE_ID` | `sa_site_live_xxxx…` | Studio → Sites, an **operator-enabled** site | no |
| `OPERATOR_SITE_SECRET` | `sa_secret_live_xxxx…` | the same site | **YES — server only** |
| `OPERATOR_WORKFLOW_ID` | `01a0c809-70dc-76b5-…` (a UUID) | the copilot workflow | no |
| `OPERATOR_EXTERNAL_ID` | `op_console` | your app (see §6) | no |
| `OPERATOR_NAME` | `Console Operator` | your app | no |

Notes:

- **The site keys are a different credential from your workspace/API key.** A
  workspace key does not authorise the operator surface and the site secret
  does not authorise the REST API. Both can be present and unrelated.
- `OPERATOR_WORKFLOW_ID` may be blank — it then falls back to the tenant's
  default agent. Set it if you want a specific copilot.
- `OPERATOR_SITE_SECRET` belongs in server-side env only. It must not appear in
  a client bundle, a `VITE_`/`NEXT_PUBLIC_` variable, or a committed file. Add
  it to whatever your logger redacts.

### `.env`

```bash
OPERATOR_API_HOST=https://acme-api.perfox.ai
OPERATOR_SITE_ID=sa_site_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPERATOR_WORKFLOW_ID=
OPERATOR_SITE_SECRET=sa_secret_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPERATOR_EXTERNAL_ID=op_console
OPERATOR_NAME=Console Operator
```

### Origins

Add every origin the app is served from, exactly, to the site **and** the
operator node:

```
http://localhost:5190          ← dev (this project's Vite port)
https://console.example.com    ← production
```

Scheme included, no trailing slash, and `localhost` is **not** the same as
`127.0.0.1` — list both if you use both.

---

## 5. Step 1 — install the SDK

```bash
mkdir -p vendor
cp /path/to/perfox-operator-react-0.1.0.tgz vendor/
```

```jsonc
// package.json
"dependencies": {
  "@perfox/operator-react": "file:vendor/perfox-operator-react-0.1.0.tgz"
}
```

```bash
npm install
```

This pulls in `livekit-client` (~560 kB) as a transitive dependency. The SDK
imports it **dynamically**, so a bundler splits it into its own chunk and it is
only downloaded when a call actually starts. Do not force it into the main
bundle.

---

## 6. Step 2 — the signing endpoint

One endpoint. It returns the public site config plus a signed identity, and
never the secret.

```js
// server — Node, zero dependencies beyond node:crypto
import { createHmac } from 'node:crypto'

const OPERATOR = {
  apiHost: (process.env.OPERATOR_API_HOST ?? '').replace(/\/+$/, ''),
  siteId: process.env.OPERATOR_SITE_ID ?? '',
  workflowId: process.env.OPERATOR_WORKFLOW_ID ?? '',
  secret: process.env.OPERATOR_SITE_SECRET ?? '',
}

const signOperator = (externalId) =>
  createHmac('sha256', OPERATOR.secret)
    .update(`${OPERATOR.siteId}.${externalId}`)
    .digest('hex')

// GET /api/operator/config
function operatorConfig(req, res) {
  if (!OPERATOR.apiHost || !OPERATOR.siteId || !OPERATOR.secret) {
    return res.status(503).json({ error: 'Operator SDK is not configured.' })
  }

  // ▼ THE IMPORTANT LINE — derive identity from the session, never the request.
  const externalId = `op_${req.session.user.id}`
  const name = req.session.user.name

  res.json({
    apiHost: OPERATOR.apiHost,
    siteId: OPERATOR.siteId,
    workflowId: OPERATOR.workflowId || null,
    operator: { externalId, name, userHash: signOperator(externalId) },
  })
}
```

The response shape is deliberately the SDK's `config` object, so it drops
straight into the provider with no remapping.

### If your app has no login

This one does not, so it signs a single fixed identity from env
(`OPERATOR_EXTERNAL_ID`). Be aware of what that means: **every browser that
opens the app is the same operator.** Two tabs are one operator and will
contend over presence; an inbound call could ring either. That is acceptable
for a single-seat console and is the first thing to fix if the app gets real
users.

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
      .then((r) => (r.ok ? r.json() : r.json().then((b) => Promise.reject(new Error(b.error)))))
      .then((c) => live && setConfig(c))
      .catch((err) => live && setReason(err.message))
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

function CallBridge({ children }) {
  const op = useOperator()
  const { dialOut, hold, hangup, setMicEnabled, session } = op
  const active = op.activeCall

  // The SDK does not track WHO you are calling — activeCall has ids and status
  // but no name or number, and the panel needs both from the click onward.
  const [party, setParty] = useState(null)
  const [dialing, setDialing] = useState(false)

  useEffect(() => { if (active?.status === 'ended') setParty(null) }, [active?.status])

  const dial = useCallback(async ({ name, phone }) => {
    const digits = String(phone ?? '').replace(/[^\d+]/g, '')
    if (!digits) throw new Error('No phone number to dial.')
    setParty({ name: name || digits, phone: digits })
    setDialing(true)
    try { await dialOut(digits) } finally { setDialing(false) }

    // dialOut REPORTS FAILURE IN STATE, NOT BY THROWING. Read the outcome back
    // or callers will announce a call that never happened.
    const s = session.getState()
    if (!s.activeCall || s.activeCall.status === 'ended') {
      setParty(null)
      throw new Error(s.error ?? 'The call could not be connected.')
    }
  }, [dialOut, session])

  const end = useCallback(async () => { await hangup(); setParty(null) }, [hangup])

  const value = useMemo(() => ({
    ready: true,
    reason: null,
    call: party && (dialing || active) && active?.status !== 'ended'
      ? {
          ...party,
          conversationId: active?.conversationId ?? null,
          status: active?.status ?? 'dialing',
          onHold: Boolean(active?.onHold),
          muted: !op.micEnabled,
        }
      : null,
    dialing,
    // The SDK sets `error` but never clears it — a failed dial would otherwise
    // stay on screen through the next good call.
    error: active?.status === 'live' ? null : op.error,
    dial,
    end,
    hold: (on) => hold(on),
    mute: (on) => setMicEnabled(!on),
  }), [party, dialing, active, op.micEnabled, op.error, dial, end, hold, setMicEnabled])

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}
```

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

## 8. Step 4 — wire it into Call Settings

Two distinct jobs. Do both.

### 8a. The Call Settings screen — configure and verify

A settings screen should let someone confirm the connector is live *before*
they are on a call with a customer. Surface the config the browser is allowed
to see, plus a reachability check.

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

      <StatusRow
        tone={ready ? 'ok' : 'warn'}
        label={ready ? 'Connected' : 'Not connected'}
        detail={ready ? null : reason}
      />

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
from the browser hands it to anyone with devtools. Secrets change in server
env, not in the UI.

If you want settings to be editable at runtime rather than env-driven, store
them server-side (a DB row) and have the endpoint read from there — the browser
still only ever receives the non-secret fields plus the signed hash. That is
how the sibling project `perfox-contact-center` does it, keyed per "AI agent".

### 8b. The call trigger — replace agent outbound

Wherever the app currently places a call, swap the outbound request for
`dial()`:

```jsx
function CallButton({ customer }) {
  const { dial, call, ready, reason } = useCall()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const blocked = !customer.phone ? 'No phone number'
    : !ready ? reason
    : call ? 'You are already on a call'
    : null

  async function placeCall() {
    setBusy(true); setError(null)
    try {
      await dial({ name: customer.name, phone: customer.phone })
    } catch (err) {
      setError(err.message)     // works because dial() re-throws — see §7
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button disabled={Boolean(blocked) || busy} title={blocked ?? `Call ${customer.phone}`}
              onClick={placeCall}>
        {busy ? 'Calling…' : 'Call'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  )
}
```

**Revisit your disable conditions.** If the old button was gated on "does this
conversation's agent have a phone trigger", that check is now meaningless — the
operator places the call through the site, so the agent's triggers have no say.
Gate on: a phone number exists, the connector is ready, and no call is already
up.

**Update the wording too.** "The agent will phone them" is no longer true.
Tell the user *they* are calling and that their microphone goes live on pickup
— people should not be surprised by an open mic.

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

Two details that matter more than they look:

- **Start the duration timer on `live`**, not when the panel appears.
  Otherwise it counts ringing time and reads as a longer call than happened.
- **Reset it per `conversationId`**, or a second call continues the first's
  count.

---

## 9. Troubleshooting — the three gates

Each check fails with its own `403`, so the error body tells you which one. They
are evaluated in this order; fixing one reveals the next.

| Response | Meaning | Fix |
|---|---|---|
| `origin_not_allowed` | The `Origin` header is not on the site's list | Add the exact origin to **allowed_origins on the site AND on the operator node**. Both. This is the one that eats afternoons |
| `operator_not_enabled` | The site is not flagged for the operator SDK | Enable the operator SDK on the site in Studio → Sites. May be tenant/plan-gated |
| `operator_signature_required` | The `user_hash` did not verify | Usually **not** a bad secret: check that `OPERATOR_SITE_ID` and `OPERATOR_SITE_SECRET` are from the *same* site, and that the `siteId` in the hash matches the `X-Perfox-Site` header. Easy to hit after switching sites |

Verify from the command line without touching the UI — `availability` with
`status: "away"` exercises all three gates and changes nothing:

```bash
CFG=$(curl -s http://localhost:8787/api/operator/config)
SITE=$(echo "$CFG" | sed -n 's/.*"siteId":"\([^"]*\)".*/\1/p')
EXT=$(echo  "$CFG" | sed -n 's/.*"externalId":"\([^"]*\)".*/\1/p')
HASH=$(echo "$CFG" | sed -n 's/.*"userHash":"\([^"]*\)".*/\1/p')

curl -s -X POST "https://acme-api.perfox.ai/api/public/operator/availability" \
  -H "Content-Type: application/json" \
  -H "X-Perfox-Site: $SITE" \
  -H "Origin: http://localhost:5190" \
  -d "{\"operator\":{\"external_id\":\"$EXT\",\"name\":\"probe\",\"user_hash\":\"$HASH\"},\"status\":\"away\"}"
```

`{"ok":true}` means the connector is good and any remaining problem is in the
UI. Use the real origin of your app in the `Origin` header — that is the value
being tested.

### Other symptoms

| Symptom | Cause |
|---|---|
| Dial resolves, no audio, no error | Not a secure context — mic blocked. HTTPS, or use `localhost` |
| Panel shows a stale error on a good call | The SDK never clears `state.error`; suppress it while `status === 'live'` (§7) |
| A failed call reports success | `dialOut` does not throw — read `session.getState()` back (§7) |
| `dial: no answer` after ~30s | Nobody picked up; the SDK retries `answer` 30 × 1s |
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
hangup()
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
incomingCall, micEnabled, error,
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
| `ringPollMs` | no | default `2500` |

### Endpoints the SDK calls

All `POST {apiHost}/api/public/operator/<route>`, header
`X-Perfox-Site: <siteId>`, body `{ operator: {external_id, name, user_hash}, …}`:

```
availability  pending  answer  decline  call_outbound  call_status
session/start  session/stop  hold  transfer  conversations  history
summary  customer_profile  operator_defaults  transcribe  log_action
```

Plus a WebSocket at `wss://…/api/public/operator/stream?…` for transcript and
AI events, and a LiveKit room for audio.

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

**Identity.** Fixed `op_console` here because there is no login. Anything with
real users should derive `externalId` from the session. See §6.

**Where the conversation lives.** A call opens **its own conversation** on the
platform — it is a session with its own recording, not a continuation of
whatever thread the button was pressed on. Say so in the UI; users otherwise
expect the call to be appended to the thread they were reading.

**What to render.** The session carries transcript, whispers, Ask-AI,
compliance and KB whether or not you display them. Adding them later is UI
work, not integration work — the data is already arriving.

**Bundle size.** `livekit-client` is ~560 kB. Keep it dynamically imported so
it loads on first call, not on first page view.
