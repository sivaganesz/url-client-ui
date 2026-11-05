import Composer from './Composer'
import ToolEvent from './ToolEvent'
import { isTechnical } from './technical'
import { EmptyState, ErrorState, Skeleton } from '../ui/States'
import { IconAlert, IconChat, IconCheck, IconClock, IconTicks } from '../icons'
import { cn } from '../../lib/cn'
import type { AgentReach, Conversation, Message } from '../../lib/types'
import type { Resource } from '../../lib/useResource'

/**
 * The carrier's verdict on a message we sent, drawn the way WhatsApp draws it.
 *
 * Nothing at all until a delivery_status event reports on the message, which
 * is the honest state rather than an incomplete one: a phone call and the web
 * widget report no delivery, so there is no tick to draw and never will be.
 * Only the stages that actually arrive are shown — an unticked bubble means
 * "not heard back about", never "failed".
 */
function DeliveryMark({ status, error }: { status: Message['delivery']; error?: string }) {
  if (!status) return null

  /* Not late stages of the same journey. The message did not arrive, and a
     hopeful single tick would say the opposite of what happened. */
  if (status === 'failed' || status === 'suppressed') {
    const label = status === 'failed' ? 'Not delivered' : 'Not sent'
    return (
      <span className="inline-flex items-center gap-1 text-danger" title={error || label}>
        <IconAlert size={11} />
        {label}
      </span>
    )
  }

  const [Icon, label] =
    status === 'queued'
      ? ([IconClock, 'Queued'] as const)
      : status === 'sent'
        ? ([IconCheck, 'Sent'] as const)
        : status === 'read'
          ? ([IconTicks, 'Read'] as const)
          : ([IconTicks, 'Delivered'] as const)

  return (
    // The label rides on the wrapper: the icons set aria-hidden on themselves,
    // so one passed through to the svg would be announced to nobody.
    <span role="img" aria-label={label} title={label} className="inline-flex items-center">
      {/* Read is the only one that takes colour, which is the whole point of
          the blue pair — it is scanned, not read. */}
      <Icon size={12} className={status === 'read' ? 'text-brand' : undefined} />
    </span>
  )
}

/**
 * What a bubble says, and the options it offered.
 *
 * A buttons reply arrives twice over: `text` has the body with each option
 * flattened onto its own `- ` line, and `message` has them apart. Rendering
 * `text` puts "- Reschedule Visit" in the middle of a sentence, which is three
 * tappable buttons pretending to be prose. So the body comes from the envelope
 * where there is one, and the options are drawn underneath it.
 *
 * They are not controls here. The customer taps these in WhatsApp; this
 * console is reading a record of what they were offered, so they are plain
 * text in a box and nothing invites a click that would do nothing.
 */
function Body({ message }: { message: Message }) {
  const envelope = message.structured
  const body = envelope?.body?.trim() || message.text
  const buttons = envelope?.buttons ?? []

  if (buttons.length === 0) return <>{body}</>

  return (
    <>
      {body}
      {/* `current` rather than a named colour: this sits inside three
          different fills and has to read on all of them. */}
      <span className="mt-2.5 flex flex-col gap-1 border-t border-current/20 pt-2">
        {buttons.map((b, i) => (
          <span
            key={b.id ?? i}
            className="rounded-md bg-current/15 px-2.5 py-1.5 text-center text-[12px] font-medium"
          >
            {b.title}
          </span>
        ))}
      </span>
    </>
  )
}

export default function TranscriptTab({
  conversation,
  thread,
  reach,
  showTechnical,
  onSent,
}: {
  conversation: Conversation
  thread: Resource<Message[]>
  reach: Resource<AgentReach>
  /** Owned by the tab row above, which is where the control for it lives. */
  showTechnical: boolean
  onSent?: (conversationId: string | null) => void
}) {
  const hidden = thread.data.filter(isTechnical).length
  const visible = showTechnical ? thread.data : thread.data.filter((m) => !isTechnical(m))

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 sm:p-5">
        {thread.status === 'loading' ? (
          <div className="flex flex-col gap-4">
            {[62, 48, 74, 40].map((w, i) => (
              <Skeleton
                key={i}
                className={cn('h-14', i % 2 ? 'self-start' : 'self-end')}
                style={{ width: `${w}%` }}
              />
            ))}
          </div>
        ) : thread.status === 'error' ? (
          <ErrorState error={thread.error} onRetry={thread.reload} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={IconChat}
            title="No messages"
            note={
              hidden > 0
                ? 'Nothing was said in this conversation — only technical events, which are hidden.'
                : 'This conversation has no transcript events.'
            }
          />
        ) : (
          visible.map((m) =>
            m.role === 'tool' ? (
              <ToolEvent key={m.id} event={m} />
            ) : m.role === 'system' ? (
              <span
                key={m.id}
                className="inline-flex max-w-full items-center gap-1.5 self-center rounded-full border border-line bg-sunken px-2.5 py-1 text-[10.5px] text-ink-3"
              >
                <IconClock size={10} className="shrink-0" />
                <span className="truncate">
                  {m.eventType?.replaceAll('_', ' ')}
                  {m.time && ` · ${m.time}`}
                </span>
              </span>
            ) : (
              /* The customer on the left, us on the right — the way every
                 messaging app the reader already uses lays a thread out. An
                 operator sits on our side, because it is the same side of the
                 conversation, and is tinted rather than filled so a reader can
                 tell at a glance which replies a person wrote. */
              <div
                key={m.id}
                className={cn(
                  'flex max-w-[82%] flex-col gap-1 sm:max-w-[68%]',
                  m.role === 'customer' ? 'items-start self-start' : 'items-end self-end',
                )}
              >
                <span className="px-1 text-[10.5px] font-medium text-ink-3">
                  {m.role === 'customer'
                    ? conversation.name
                    : m.role === 'operator'
                      ? m.author
                      : `AI · ${conversation.agent ?? m.author}`}
                </span>
                <div
                  className={cn(
                    /* `whitespace-pre-line` because the agent sends real line
                       breaks and they were being collapsed, running a reply
                       written as several short lines into one paragraph. */
                    'px-3.5 py-2.5 text-[13px] leading-relaxed break-words whitespace-pre-line',
                    m.role === 'customer'
                      ? 'rounded-[14px_14px_14px_4px] border border-line bg-surface text-ink'
                      : m.role === 'operator'
                        ? 'rounded-[14px_14px_4px_14px] border border-brand/25 bg-brand-soft text-ink'
                        : 'rounded-[14px_14px_4px_14px] bg-brand text-on-accent',
                  )}
                >
                  <Body message={m} />
                </div>
                {/* The tick belongs only to what we sent; nothing reports on
                    what the customer wrote. */}
                <span className="flex items-center gap-1 px-1 text-[10px] text-ink-4">
                  {m.time}
                  {m.role !== 'customer' && (
                    <DeliveryMark status={m.delivery} error={m.deliveryError} />
                  )}
                </span>
              </div>
            ),
          )
        )}
      </div>
      <Composer conversation={conversation} reach={reach} onSent={onSent} />
    </>
  )
}

