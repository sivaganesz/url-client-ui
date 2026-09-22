import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../ui/Avatar'
import Badge, { StatusBadge } from '../ui/Badge'
import Spinner from '../ui/Spinner'
import ConfirmDialog from '../ui/ConfirmDialog'
import { Tabs } from '../ui/Field'
import OverviewTab from './OverviewTab'
import TranscriptTab from './TranscriptTab'
import { IconChat, IconChevronLeft, IconPhone, IconX, channelIcon } from '../icons'
import { cn } from '../../lib/cn'
import { EMPTY_REACH } from '../../lib/shapes'
import { useResource } from '../../lib/useResource'
import { callInfoOf, getAgentReach, getMessages, startOutbound } from '../../lib/api'
import type { CallTarget, Conversation, SendResult } from '../../lib/types'

export default function ConversationDetail({
  conversation,
  onBack,
  onCalling,
}: {
  conversation: Conversation
  onBack?: () => void
  onCalling: (call: CallTarget) => void
}) {
  const [tab, setTab] = useState('overview')

  const loadMessages = useCallback(
    (signal: AbortSignal) => getMessages(conversation.id, signal),
    [conversation.id],
  )
  const thread = useResource(loadMessages, [], [conversation.id])

  // What this conversation's own agent can be reached on. One request, and the
  // Call button and the composer chips both read it.
  const loadReach = useCallback(
    (signal: AbortSignal) => getAgentReach(conversation.agentId, signal),
    [conversation.agentId],
  )
  const reach = useResource(loadReach, EMPTY_REACH, [conversation.agentId])

  const [confirmCall, setConfirmCall] = useState(false)
  const [calling, setCalling] = useState(false)
  const [callResult, setCallResult] = useState<SendResult | null>(null)

  const cannotCall = !conversation.phone
    ? 'No phone number on this conversation'
    : !conversation.agentId
      ? 'This conversation has no agent'
      : reach.status === 'loading'
        ? 'Checking whether this agent takes calls…'
        : !reach.data.channels.includes('Phone')
          ? `${conversation.agent ?? 'This agent'} has no phone trigger`
          : null

  async function placeCall() {
    setConfirmCall(false)
    setCalling(true)
    setCallResult(null)
    // `cannotCall` already gates the button on both of these; repeating
    // them here is what lets the call below read as one that cannot be made
    // without an agent and a number.
    if (!conversation.agentId || !conversation.phone) return
    try {
      const r = await startOutbound({
        agentId: conversation.agentId,
        channel: 'phone',
        to: conversation.phone.replace(/[^\d+]/g, ''),
        customerId: conversation.customerId || undefined,
      })
      // A call opens its own conversation — it is a session, not this thread.
      setCallResult({ ok: true, id: r.conversationId, status: r.status })
      onCalling({
        name: conversation.title,
        phone: conversation.phone,
        conversationId: r.conversationId,
      })
    } catch (err) {
      setCallResult({ ok: false, text: (err as Error).message })
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
            <button
              type="button"
              disabled={Boolean(cannotCall) || calling}
              title={cannotCall ?? `${conversation.agent} will phone ${conversation.phone}`}
              onClick={() => setConfirmCall(true)}
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
                cannotCall
                  ? 'cursor-not-allowed border-line bg-sunken text-ink-4'
                  : 'border-brand-line bg-brand-soft text-brand hover:border-brand hover:bg-brand hover:text-white',
              )}
            >
              {calling ? (
                <Spinner size={12} />
              ) : (
                <IconPhone size={13} />
              )}
              {calling ? 'Calling…' : 'Call'}
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
              {callResult.ok ? (
                <>
                  Calling {conversation.phone} — the call has its own conversation.{' '}
                  {callResult.id && (
                    <Link to={`/conversations/${callResult.id}`} className="font-medium text-brand hover:underline">
                      Open it
                    </Link>
                  )}
                </>
              ) : (
                callResult.text
              )}
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
        body={`${conversation.agent} will phone ${conversation.phone} now. The call opens its own conversation — a call is a session with its own recording, not a continuation of this thread.`}
        confirmLabel="Call now"
        onConfirm={placeCall}
        onCancel={() => setConfirmCall(false)}
      />
    </div>
  )
}

/* ── transcript tab ───────────────────────────────────────── */

