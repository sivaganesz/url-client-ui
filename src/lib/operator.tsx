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

export interface ActiveCall {
  /** Who we are talking to. The SDK does not track this — we carry it from the click. */
  name: string
  phone: string
  conversationId: string | null
  status: CallStatus
  onHold: boolean
  muted: boolean
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
 * Never throws, unlike the SDK's own `useOperator`.
 *
 * Pages call it unconditionally and read `ready`/`reason`, so a console with
 * no operator credentials explains why calling is unavailable instead of
 * crashing the page that asked.
 */
export function useCall(): CallApi {
  return useContext(CallContext) ?? NOT_MOUNTED
}

/**
 * Fetches the signed config, then mounts the SDK under it.
 *
 * Children render either way. `OperatorProvider` cannot mount before the
 * config arrives, and a gate that rendered nothing until then would blank the
 * whole app on a slow or missing connector.
 */
/** How long to wait for the config before calling the connector unreachable. */
const CONFIG_TIMEOUT_MS = 8000

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
        if (live) setConfig(c)
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

/** Maps the SDK's surface onto the smaller one this console needs. */
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

  useEffect(() => {
    if (active?.status === 'ended') setParty(null)
  }, [active?.status])

  const dial = useCallback(
    async ({ name, phone }: { name?: string | null; phone?: string | null }) => {
      const digits = String(phone ?? '').replace(/[^\d+]/g, '')
      if (!digits) throw new Error('No phone number to dial.')

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
        throw new Error(s.error ?? 'The call could not be connected.')
      }
    },
    [dialOut, session, dismissed],
  )

  const end = useCallback(async () => {
    await hangup()
    setParty(null)
  }, [hangup])

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
        }
      : null

  const value = useMemo<CallApi>(
    () => ({
      ready: true,
      reason: null,
      call,
      dialing,
      // A live call is proof the last error is history.
      error: active?.status === 'live' || op.error === dismissed ? null : op.error,
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
