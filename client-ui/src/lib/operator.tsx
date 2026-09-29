import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { OperatorProvider, useOperator } from '@perfox/operator-react'
import type { OperatorConfig } from '@perfox/operator-react'

/**
 * Operator calling — a person on the phone, in this browser.
 *
 * Worth being clear about what changed, because two different things on this
 * platform both look like "making a call":
 *
 *   · agent outbound (POST /outbound) — the AI phones the customer. The audio
 *     lives on the platform, so there is nothing local to mute or hold.
 *   · operator calling (this) — a human talks over WebRTC from the browser.
 *     Mute, hold and transfer act on the real stream.
 *
 * The console used to do the first while showing a panel built for the second;
 * CallScreen carried the comment "Mute and Hold are UI only for now". They are
 * real now, and that is the whole point of this module.
 *
 * The site secret never reaches here. /api/operator/config returns the public
 * site config plus an identity signed by the proxy, which is the only reason a
 * frontend can hold a privileged operator session at all.
 */

export type CallStatus = 'dialing' | 'ringing' | 'live' | 'ended'

/**
 * The SDK’s errors, said in English.
 *
 * It reports them as terse machine strings — `call no_answer`, `dial: 403`,
 * `session: ...` — and they go straight onto the screen of whoever just tried
 * to phone a customer. "call no_answer" is not a sentence.
 *
 * Anything unrecognised is passed through rather than replaced with something
 * vague: a message nobody has seen before is more useful raw than smoothed
 * into "an error occurred".
 */
function humanise(raw: string | null): string | null {
  if (!raw) return null

  // `call <status>` — the platform's own verdict on why the call ended.
  const ended = /^call (.+)$/.exec(raw)
  if (ended) {
    const known: Record<string, string> = {
      no_answer: 'No answer.',
      busy: 'The line was busy.',
      failed: 'The call could not be connected.',
      cancelled: 'The call was cancelled.',
      rejected: 'The call was declined.',
    }
    return known[ended[1] as string] ?? `The call ended: ${ended[1]?.replace(/_/g, ' ')}.`
  }

  if (/^dial: no answer$/i.test(raw)) return 'No answer.'
  if (/^dial: /.test(raw)) return `The call could not be placed (${raw.slice(6)}).`
  if (/^session: /.test(raw)) return `Connected, but the session could not start (${raw.slice(9)}).`
  if (/^voice: /.test(raw)) return `The audio could not be opened (${raw.slice(7)}).`
  if (/^answer: /.test(raw)) return `The call could not be picked up (${raw.slice(8)}).`

  return raw
}

export interface ActiveCall {
  /** Who we are talking to. The SDK does not track this — we carry it from the click. */
  name: string
  phone: string
  conversationId: string | null
  status: CallStatus
  onHold: boolean
  muted: boolean
  /** The audio room has connected. Until then `muted` means nothing yet. */
  audioReady: boolean
}

export interface CallApi {
  /** False when the connector could not be reached or configured; `reason` says why. */
  ready: boolean
  reason: string | null
  call: ActiveCall | null
  dialing: boolean
  error: string | null
  dial: (to: { name?: string | null; phone?: string | null }) => Promise<void>
  end: () => Promise<void>
  hold: (on: boolean) => void
  mute: (on: boolean) => void
  dismissError: () => void
}

const NOT_MOUNTED: CallApi = {
  ready: false,
  reason: 'Operator calling is not mounted.',
  call: null,
  dialing: false,
  error: null,
  dial: async () => {},
  end: async () => {},
  hold: () => {},
  mute: () => {},
  dismissError: () => {},
}

const CallContext = createContext<CallApi | null>(null)

/**
 * Never throws, unlike the SDK’s own `useOperator`.
 *
 * Pages call it unconditionally and read `ready`/`reason`, so a console with
 * no operator credentials explains why calling is unavailable instead of
 * crashing the page that asked.
 */
export function useCall(): CallApi {
  return useContext(CallContext) ?? NOT_MOUNTED
}

/** How long to wait for the config before calling the connector unreachable. */
const CONFIG_TIMEOUT_MS = 8000

/**
 * How often to ask whether the call on screen is still a call.
 *
 * The SDK decides that from single events that go missing in both
 * directions, and nothing in it ever re-checks. This does.
 */
const RECONCILE_MS = 2000

/**
 * Effectively off.
 *
 * The SDK polls `pending` every 2.5s to notice a call ringing FOR this
 * operator — routed inbound, or a transfer directed at them. This console has
 * neither: it dials out and never goes available. Since 0.1.1 the poll starts
 * in the SDK's constructor rather than on going available, so staying offline
 * no longer avoids it.
 *
 * There is no off switch, and a value above ~24 days overflows setInterval and
 * fires continuously, so this is an hour: one poll at mount, then nothing.
 * Drop the option the day inbound or transfers are switched on — both arrive
 * through this poll and neither rings without it.
 */
const RING_POLL_OFF_MS = 60 * 60 * 1000

/**
 * Ask the server to end a call and keep at it until the platform agrees.
 *
 * Not a replacement for the SDK’s hangup, which since 0.1.1 does cancel a
 * ringing call and does it better than this can — it holds Plivo’s call_id.
 * This is the half the SDK still does not do: it retries, and it checks the
 * conversation afterwards, so the work outlives whatever happens to this tab.
 *
 * `beacon` is for a page that is going away: sendBeacon is the one request a
 * closing tab is allowed to finish, and there the SDK’s hangup never gets to
 * run at all.
 */
function stopOnServer(
  conversationId: string,
  sessionId: string,
  /**
   * Whether the customer had picked up.
   *
   * A call still ringing is cancelled outright; one that was answered is
   * only stopped. The platform records a cancel as "cancelled by operator",
   * so cancelling a conversation somebody actually had would file it as
   * something that never happened.
   */
  answered: boolean,
  beacon = false,
): void {
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

/**
 * Everything the SDK needs, present and the right shape.
 *
 * Checked because the alternative is worse than a missing connector: mounting
 * `OperatorProvider` on a half-formed config throws inside the SDK, and the
 * gate would still report `ready`, so the Call button would offer a call that
 * cannot be placed.
 */
function usable(body: unknown): body is OperatorConfig {
  const c = body as Partial<OperatorConfig> | null
  return Boolean(
    c?.apiHost?.startsWith('https://') &&
      c.siteId &&
      c.operator?.externalId &&
      c.operator?.userHash,
  )
}

/**
 * The one form the carrier accepts: +91 and the ten national digits.
 *
 * Plivo refuses a bare national number, so a ten-digit entry has to be
 * completed before it goes out rather than merely allowed in. Returns null
 * when the input is not a number this deployment can dial.
 */
export function asDialled(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^00/, '')
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
  return national.length === 10 ? '+91' + national : null
}

/**
 * Whether this can be dialled. Null when it can.
 *
 * A call never reaches our backend — the browser talks to Perfox directly —
 * so this is the only place a number can be checked before a telephone rings
 * somewhere. It has to agree with destinationProblem in
 * backend/src/routes/perfox.ts, which guards the message channels.
 *
 *   6374160200        the national number
 *   916374160200      with the country code
 *   +91 63741 60200   the same, spaced or punctuated
 */
export function dialProblem(raw: string | null | undefined): string | null {
  const to = String(raw ?? '').trim()
  if (!to) return 'No phone number to dial.'

  const digits = to.replace(/\D/g, '').replace(/^00/, '')
  // Only strip a country code that could be one: 9123456789 is a ten-digit
  // national number beginning 91, not a country code and eight digits.
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits

  return national.length === 10
    ? null
    : 'Enter a 10-digit number, or the same number with +91.'
}
/**
 * Fetches the signed config, then mounts the SDK under it.
 *
 * Children render either way. `OperatorProvider` cannot mount before the
 * config arrives, and a gate that rendered nothing until then would blank the
 * whole app on a slow or missing connector.
 */
export function OperatorGate({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<OperatorConfig | null>(null)
  const [reason, setReason] = useState<string>('Connecting to the operator service…')

  useEffect(() => {
    let live = true
    const controller = new AbortController()
    // Without this a proxy that accepts the connection and never answers
    // leaves the button saying "Connecting…" for the rest of the session.
    const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS)

    fetch('/api/operator/config', { signal: controller.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (!r.ok) throw new Error(body?.reason ?? `The operator service answered ${r.status}.`)
        // A console with no operator credentials is a supported state, not an
        // error — it answers 200 and says so, and calling stays unavailable
        // with a reason the buttons can show.
        if (body?.configured === false) throw new Error(body.reason ?? 'Operator calling is not configured.')
        if (!usable(body)) throw new Error('The operator service returned an incomplete configuration.')
        return body
      })
      .then((c) => {
        if (live) setConfig({ ...c, ringPollMs: RING_POLL_OFF_MS })
      })
      .catch((err: Error) => {
        if (!live) return
        // "Failed to fetch" and an abort are both just "we couldn't reach it",
        // and neither is worth showing a user verbatim.
        const network = err.name === 'AbortError' || err.name === 'TypeError'
        setReason(network ? 'The operator service could not be reached.' : err.message)
      })
      .finally(() => clearTimeout(timer))

    return () => {
      live = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [])

  if (!config) {
    return (
      <CallContext.Provider value={{ ...NOT_MOUNTED, reason }}>{children}</CallContext.Provider>
    )
  }

  return (
    <OperatorProvider config={config}>
      <CallBridge>{children}</CallBridge>
    </OperatorProvider>
  )
}

/** Maps the SDK’s surface onto the smaller one this console needs. */
function CallBridge({ children }: { children: ReactNode }) {
  const op = useOperator()
  const { dialOut, hold, hangup, setMicEnabled, session } = op
  const active = op.activeCall

  // The SDK reports ids and a status but never who is on the other end, and
  // the panel needs a name and a number from the moment of the click.
  const [party, setParty] = useState<{ name: string; phone: string } | null>(null)
  const [dialing, setDialing] = useState(false)

  /**
   * Errors the UI has finished with.
   *
   * The SDK sets `error` and only clears it in `setAvailability` and
   * `openConversation` — neither of which this console calls, because it never
   * goes available (that would enrol it in inbound ring routing with no answer
   * UI to receive one). So a failed dial's message would otherwise sit there
   * through every later call. We track what has been shown and ignore it.
   */
  const [dismissed, setDismissed] = useState<string | null>(null)

  /**
   * Whether the audio room has actually connected.
   *
   * The SDK sets status 'live' in `beginSession`, which runs *before*
   * `joinVoice` finishes — and `micEnabled` starts false and only flips true
   * when the room connects. So for a second or two at pickup the panel would
   * say the operator is muted when they are not, at the one moment that
   * matters most.
   *
   * `micEnabled` alone cannot tell "not connected yet" from "deliberately
   * muted", so this latches on the first time it goes true and resets per
   * call.
   */
  const [audioReady, setAudioReady] = useState(false)

  useEffect(() => {
    if (active?.status === 'ended') setParty(null)
  }, [active?.status])

  useEffect(() => {
    if (op.micEnabled) setAudioReady(true)
  }, [op.micEnabled])

  // A new call starts with its audio unconnected again.
  useEffect(() => {
    setAudioReady(false)
  }, [active?.conversationId])

  const dial = useCallback(
    async ({ name, phone }: { name?: string | null; phone?: string | null }) => {
      const problem = dialProblem(phone)
      if (problem) throw new Error(problem)
      // dialProblem has already refused anything asDialled cannot complete,
      // and the carrier will not take a bare national number.
      const digits = asDialled(phone)!

      // Clear whatever the last attempt left behind, so a stale message cannot
      // be mistaken for this one failing.
      setDismissed(session.getState().error ?? null)
      setParty({ name: name || digits, phone: digits })
      setDialing(true)
      try {
        await dialOut(digits)
      } finally {
        setDialing(false)
      }

      /**
       * dialOut reports failure in state and never throws, so the outcome has
       * to be read back or this resolves as a success on a call that never
       * connected.
       *
       * Checking activeCall alone is not enough. On the commonest failure — no
       * answer after 30 seconds — the SDK sets `error` but leaves activeCall
       * at status 'dialing', so a status check passes and the panel would show
       * "Calling…" forever. The error is the reliable signal.
       */
      const s = session.getState()
      const failed =
        !s.activeCall || s.activeCall.status === 'ended' || (s.error && s.error !== dismissed)
      if (failed) {
        setParty(null)
        throw new Error(humanise(s.error) ?? 'The call could not be connected.')
      }
    },
    [dialOut, session, dismissed],
  )

  /**
   * Ending a call: tell the SDK, then make sure it happened.
   *
   * hangup() stops the local audio and fires a stop request it never waits
   * for, then reports the call ended regardless. When that request fails the
   * panel closes over a line that is still open, which is what an operator
   * hanging up on a customer who can still hear them looks like.
   *
   * The ids are read first because endLocal clears the session on its way
   * out, and the stop is addressed to the session it is about to forget.
   */
  const end = useCallback(async () => {
    const current = session.getState().activeCall
    const conversationId = current?.conversationId ?? null
    const sessionId = current?.sessionId ?? ''
    const answered = current?.status === 'live'

    await hangup()
    setParty(null)

    if (conversationId) stopOnServer(conversationId, sessionId, answered)
  }, [hangup, session])

  /**
   * The conversation, asked for as long as a call is up.
   *
   * A call is over when its conversation is. That is the one account both
   * sides agree on, and the SDK consults it for neither: it learns the
   * customer hung up only from a room participant whose identity starts with
   * "phone-bridge", and a declined call never produces one at all.
   *
   * Only once the call is live, though, and that guard is load-bearing.
   *
   * This used to watch from the first ring, on the reasoning that a rejected
   * call never reaches live. That was safe while the SDK’s hangup() did
   * nothing to a call without an audio room: a wrong verdict here closed the
   * panel and no more. Since 0.1.1 hangup() cancels a dialing or ringing call
   * server-side, so the same wrong verdict now puts the phone down on a
   * customer whose handset is still ringing — two seconds in, before anybody
   * could have answered.
   *
   * The ringing window belongs to the SDK now. It polls call_status itself
   * and cancels properly, holding Plivo’s request id, which this does not
   * have. What is left for this loop is the case the SDK still misses: an
   * answered call whose ending never arrives.
   */
  useEffect(() => {
    const conversationId = active?.conversationId
    if (!conversationId || active.status !== 'live') return

    let watching = true
    const ask = async () => {
      try {
        const res = await fetch(`/api/perfox/conversations/${conversationId}`)
        if (!res.ok) return
        const body = await res.json().catch(() => null)
        // Only an explicit "ended" acts. A request that failed, or a
        // conversation the workspace has not caught up with, says nothing —
        // and must not be what takes a live call off the screen.
        const status = body?.data?.status ?? body?.status
        if (watching && status === 'ended') await end()
      } catch {
        // Same reasoning: silence is not evidence.
      }
    }

    const timer = setInterval(() => void ask(), RECONCILE_MS)
    return () => {
      watching = false
      clearInterval(timer)
    }
  }, [active?.conversationId, active?.status, end])

  /**
   * A tab closing mid-call.
   *
   * The SDK’s own teardown drops the audio and the socket and never tells
   * the platform anything, so the customer is left holding a line to a
   * browser that no longer exists. The server is told on the way out and
   * finishes the job without us.
   */
  useEffect(() => {
    const leaving = () => {
      const current = session.getState().activeCall
      if (current?.conversationId && current.status !== 'ended') {
        stopOnServer(
          current.conversationId,
          current.sessionId ?? '',
          current.status === 'live',
          true,
        )
      }
    }
    window.addEventListener('pagehide', leaving)
    return () => window.removeEventListener('pagehide', leaving)
  }, [session])

  const dismissError = useCallback(() => {
    setDismissed(session.getState().error ?? null)
  }, [session])

  const call: ActiveCall | null =
    party && (dialing || active) && active?.status !== 'ended'
      ? {
          ...party,
          conversationId: active?.conversationId ?? null,
          status: (active?.status as CallStatus) ?? 'dialing',
          onHold: Boolean(active?.onHold),
          muted: !op.micEnabled,
          // Held counts as connected: hold deliberately drops the mic, and the
          // controls must stay usable so the call can be resumed.
          audioReady: audioReady || Boolean(active?.onHold),
        }
      : null

  const value = useMemo<CallApi>(
    () => ({
      ready: true,
      reason: null,
      call,
      dialing,
      // A live call is proof the last error is history.
      error: active?.status === 'live' || op.error === dismissed ? null : humanise(op.error),
      dial,
      end,
      hold: (on: boolean) => void hold(on),
      mute: (on: boolean) => void setMicEnabled(!on),
      dismissError,
    }),
    [call, dialing, active?.status, op.error, dismissed, dial, end, hold, setMicEnabled, dismissError],
  )

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}

/**
 * Seconds a call has been up.
 *
 * Counts from `live`, not from when the panel appeared — otherwise it includes
 * ringing time and reports a longer call than happened. Resets per
 * conversation so a second call does not continue the first one's count.
 */
export function useCallSeconds(call: ActiveCall | null): number {
  const [seconds, setSeconds] = useState(0)
  const countedFor = useRef<string | null>(null)

  const id = call?.conversationId ?? null
  const live = call?.status === 'live'
  const onHold = Boolean(call?.onHold)

  useEffect(() => {
    if (countedFor.current !== id) {
      countedFor.current = id
      setSeconds(0)
    }
  }, [id])

  useEffect(() => {
    if (!live || onHold) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [live, onHold])

  return seconds
}
