import Composer from './Composer'
import ToolEvent from './ToolEvent'
import { EmptyState, ErrorState, Skeleton } from '../ui/States'
import { IconChat, IconClock } from '../icons'
import { cn } from '../../lib/cn'
import type { AgentReach, Conversation, Message } from '../../lib/types'
import type { Resource } from '../../lib/useResource'

export default function TranscriptTab({
  conversation,
  thread,
  reach,
}: {
  conversation: Conversation
  thread: Resource<Message[]>
  reach: Resource<AgentReach>
}) {
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
        ) : thread.data.length === 0 ? (
          <EmptyState icon={IconChat} title="No messages" note="This conversation has no transcript events." />
        ) : (
          thread.data.map((m) =>
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
              /* Customer right in brand fill, agent left on surface — matching
                 the console, which is the inverse of a normal inbox. */
              <div
                key={m.id}
                className={cn(
                  'flex max-w-[82%] flex-col gap-1 sm:max-w-[68%]',
                  m.role === 'customer' ? 'items-end self-end' : 'items-start self-start',
                )}
              >
                <span className="px-1 text-[10.5px] font-medium text-ink-3">
                  {m.role === 'customer' ? conversation.name : `AI · ${conversation.agent ?? m.author}`}
                </span>
                <div
                  className={cn(
                    'px-3.5 py-2.5 text-[13px] leading-relaxed break-words',
                    m.role === 'customer'
                      ? 'rounded-[14px_14px_4px_14px] bg-brand text-white'
                      : 'rounded-[14px_14px_14px_4px] border border-line bg-surface text-ink',
                  )}
                >
                  {m.text}
                </div>
                <span className="px-1 text-[10px] text-ink-4">{m.time}</span>
              </div>
            ),
          )
        )}
      </div>
      <Composer conversation={conversation} reach={reach} />
    </>
  )
}

