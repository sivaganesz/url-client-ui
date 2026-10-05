import { useCallback, useEffect, useRef, useState } from 'react'
import Avatar from '../ui/Avatar'
import Badge, { StatusBadge } from '../ui/Badge'
import Spinner from '../ui/Spinner'
import ConfirmDialog from '../ui/ConfirmDialog'
import { Tabs } from '../ui/Field'
import OverviewTab from './OverviewTab'
import TranscriptTab from './TranscriptTab'
import { IconChat, IconChevronLeft, IconPhone, IconPhoneDown, IconX, channelIcon } from '../icons'
import { cn } from '../../lib/cn'
import { EMPTY_REACH } from '../../lib/shapes'
import { useResource } from '../../lib/useResource'
import { callInfoOf, getAgentReach, getMessages } from '../../lib/api'
import { useCall } from '../../lib/operator'
import type { Conversation, SendResult } from '../../lib/types'

export default function ConversationDetail({
  conversation,
  onBack,
}: {
  conversation: Conversation
  onBack?: () => void
}) {
  const [tab, setTab] = useState('overview')

  const loadMessages = useCallback(
    (signal: AbortSignal) => getMessages(conversation.id, signal),
    [conversation.id],
  )
  const thread = useResource(loadMessages, [], [conversation.id])

  // What this conversation's own agent can be reached on — the composer chips
  // read it. The Call button no longer does: the operator places the call
  // through the site, so the agent's triggers have no say in it.
  const loadReach = useCallback(
    (signal: AbortSignal) => getAgentReach(conversation.agentId, signal),
    [conversation.agentId],
  )
  const reach = useResource(loadReach, EMPTY_REACH, [conversation.agentId])

  const operator = useCall()

  const [confirmCall, setConfirmCall] = useState(false)
  const [calling, setCalling] = useState(false)
  const [callResult, setCallResult] = useState<SendResult | null>(null)

  /**
   * Whether the call on screen is this conversation's own.
   *
   * Matched on the number rather than the conversation id: placing a call
   * opens a conversation of its own, so the id in the panel is never the id
   * of the page the call was placed from.
   */
  const digitsOf = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '')
  const onThisCall = Boolean(
    operator.call &&
      conversation.phone &&
      digitsOf(operator.call.phone) === digitsOf(conversation.phone),
  )
  /**
   * What stops this call being placed.
   *
   * The agent's phone trigger is deliberately NOT one of them any more. This
   * used to ask the workspace whether the conversation's agent could take
   * calls, because the agent was the one dialling. The operator places the
   * call through the site now, so the agent's triggers have no say in it —
   * checking them would disable the button for a call that would work.
   */
  const cannotCall = !conversation.phone
    ? 'No phone number on this conversation'
    : !operator.ready
      ? operator.reason
      : // A call to somebody else still blocks this one. This page's own call
        // blocks nothing, because the button ends it instead of placing it.
        operator.call && !onThisCall
        ? 'You are already on a call'
        : null

  /**
   * Hanging up from this button, as distinct from the call failing.
   *
   * dial() settles only once the call is over and reports one that ended
   * early as one that could not be connected. Without this, ending a call
   * on purpose would raise "The call could not be connected" over the
   * conversation a moment after the operator chose to end it.
   */
  const endedHere = useRef(false)

  /**
   * "Calling…" ends when the call does, not when dial() settles.
   *
   * dial() resolves only once the SDK’s dial loop stops, and hanging up does
   * not reliably stop it: the loop can run its full thirty seconds after the
   * operator has already put the phone down and the panel has closed. For
   * those thirty seconds this button said "Calling…" about a call that was
   * over, and refused to place another one. Then, when the loop finally gave
   * up, dial() rejected and put "The call could not be connected" over the
   * conversation — a verdict on a call the operator had ended themselves.
   *
   * The call on screen is the better signal, because it goes the moment the
   * operator ends it, wherever they ended it from. Waiting to have seen one
   * first matters: for the tick between the click and the panel opening there
   * is no call yet, and clearing on that would undo the click.
   *
   * A call that ends on its own — no answer, busy, declined — gets here only
   * after dial() has already thrown, so that message is still shown.
   */
  const hadCall = useRef(false)
  useEffect(() => {
    if (onThisCall) {
      hadCall.current = true
      return
    }
    if (!hadCall.current) return
    hadCall.current = false
    endedHere.current = true
    setCalling(false)
  }, [onThisCall])

  async function endCall() {
    endedHere.current = true
    await operator.end()
  }

  async function placeCall() {
    setConfirmCall(false)
    setCallResult(null)
    endedHere.current = false
    if (!conversation.phone) return
    setCalling(true)
    try {
      // The panel the shell renders takes over from here; dial() throws only
      // when the call never connected.
      await operator.dial({ name: conversation.title, phone: conversation.phone })
      setCallResult({ ok: true })
    } catch (err) {
      if (!endedHere.current) setCallResult({ ok: false, text: (err as Error).message })
    } finally {
      setCalling(false)
    }
  }

  const ChannelIcon = channelIcon[conversation.channel] ?? IconChat
  const spoken = thread.data.filter((m) => m.role === 'customer' || m.role === 'agent')
  const call = callInfoOf(thread.data)

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* header */}
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Back to conversations"
              onClick={onBack}
              className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-muted-bg md:hidden"
            >
              <IconChevronLeft size={18} />
            </button>
            <Avatar name={conversation.name} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <h2 className="truncate text-sm font-semibold">{conversation.title}</h2>
                {/* Every unnamed thread is titled "Anonymous", so the ref is
                    what tells this one from the next. */}
                {!conversation.name && conversation.ref && (
                  <span className="shrink-0 font-mono text-[11px] text-ink-4">{conversation.ref}</span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="muted" size="sm">
                  <ChannelIcon size={10} />
                  {conversation.channel}
                </Badge>
                {conversation.agent && (
                  <span className="truncate text-[11px] font-medium text-brand">
                    {conversation.agent}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/*
              One button, two jobs. While this page's call is up it ends it,
              from the first ring rather than from the moment somebody
              answers — a call dialling a number nobody meant to ring is the
              one people most want to stop. The corner panel can end it too;
              this is the place they were already looking.
            */}
            <button
              type="button"
              disabled={onThisCall ? false : Boolean(cannotCall) || calling}
              title={
                onThisCall
                  ? `End the call to ${conversation.phone}`
                  : (cannotCall ?? `Call ${conversation.phone} yourself`)
              }
              onClick={() => (onThisCall ? void endCall() : setConfirmCall(true))}
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
                onThisCall
                  ? 'border-danger/30 bg-danger-bg text-danger hover:border-danger hover:bg-danger hover:text-on-accent'
                  : cannotCall
                    ? 'cursor-not-allowed border-line bg-sunken text-ink-4'
                    : 'border-brand-line bg-brand-soft text-brand hover:border-brand hover:bg-brand hover:text-on-accent',
              )}
            >
              {onThisCall ? (
                <IconPhoneDown size={13} />
              ) : calling ? (
                <Spinner size={12} />
              ) : (
                <IconPhone size={13} />
              )}
              {onThisCall ? 'End Call' : calling ? 'Calling…' : 'Call'}
            </button>
            <StatusBadge label={conversation.status} />
          </div>
        </header>

        <div className="shrink-0 border-b border-line bg-surface px-4 pt-3 sm:px-5">
          <Tabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'transcript', label: 'Transcript' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>

        {callResult && (
          <div
            role="status"
            className={cn(
              'flex items-start gap-2.5 border-b px-4 py-2.5 text-[11.5px] sm:px-5',
              callResult.ok ? 'border-ok/25 bg-ok-bg' : 'border-danger/25 bg-danger-bg',
            )}
          >
            <IconPhone size={14} className={cn('mt-0.5 shrink-0', callResult.ok ? 'text-ok' : 'text-danger')} />
            <p className="min-w-0 flex-1 leading-relaxed text-ink-2">
              {callResult.ok
                ? `Connected to ${conversation.phone}. The call has its own conversation — it is a session with its own recording, not part of this thread.`
                : callResult.text}
            </p>
            <button
              type="button"
              onClick={() => setCallResult(null)}
              aria-label="Dismiss"
              className="shrink-0 text-ink-3 hover:text-ink"
            >
              <IconX size={13} />
            </button>
          </div>
        )}

        {tab === 'overview' ? (
          <OverviewTab conversation={conversation} thread={thread} spoken={spoken} call={call} />
        ) : (
          <TranscriptTab conversation={conversation} thread={thread} reach={reach} />
        )}
      </div>

      {/* A call reaches a real person, and the button sits one click from
          anything else in the header. */}
      <ConfirmDialog
        open={confirmCall}
        title="Place this call?"
        body={`You will call ${conversation.phone} yourself. Your microphone goes live when they pick up. The call opens its own conversation — a session with its own recording, not a continuation of this thread.`}
        confirmLabel="Call now"
        onConfirm={placeCall}
        onCancel={() => setConfirmCall(false)}
      />
    </div>
  )
}

/* ── transcript tab ───────────────────────────────────────── */

