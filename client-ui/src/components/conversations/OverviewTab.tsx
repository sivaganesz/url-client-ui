import Button from '../ui/Button'
import Card from '../ui/Card'
import RecordingPlayer from '../RecordingPlayer'
import { IconDownload } from '../icons'
import { cn } from '../../lib/cn'
import { duration } from '../../lib/api'
import { EXPORT_FORMATS, exportConversation, type ExportFormat } from '../../lib/export'
import { useSession } from '../../lib/session'
import type { callInfoOf } from '../../lib/api'
import type { Conversation, Message } from '../../lib/types'
import type { Resource } from '../../lib/useResource'

function Section({
  title,
  action,
  children,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[10.5px] font-semibold tracking-[0.07em] text-ink-3 uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  )
}

function Row({
  label,
  value,
  mono,
}: {
  label: React.ReactNode
  value?: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-b-0">
      <span className="shrink-0 text-xs text-ink-3">{label}</span>
      <span className={cn('truncate text-right text-[12.5px]', mono && 'font-mono tabular-nums')}>
        {value || '—'}
      </span>
    </div>
  )
}

export default function OverviewTab({
  conversation,
  thread,
  spoken,
  call,
}: {
  conversation: Conversation
  thread: Resource<Message[]>
  spoken: Message[]
  /** What the transcript's own events say about a call on this thread. */
  call: ReturnType<typeof callInfoOf>
}) {
  const { user, workspace } = useSession()

  /**
   * The same exporter the Analytics log uses. These two wrote different files
   * for the same conversation until it was shared — a difference nobody
   * notices until two people compare their copies and find they disagree.
   */
  const download = (format: ExportFormat) =>
    exportConversation(
      format,
      {
        id: conversation.id,
        status: conversation.status,
        startedAt: conversation.createdAt,
        customerName: conversation.name ?? undefined,
        customerEmail: conversation.email || undefined,
        customerPhone: conversation.phone || undefined,
        channel: conversation.channel,
        agent: conversation.agent ?? undefined,
        summary: conversation.preview || undefined,
        exportedBy: user?.email,
        workspace: workspace?.name,
      },
      thread.data,
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-5">
      <Section title="Summary">
        <p className="text-[13px] leading-relaxed text-ink-2">
          {conversation.preview || 'No summary was generated for this conversation.'}
        </p>
      </Section>

      <Section title="Captured information">
        <div className="flex flex-col">
          <Row label="Phone" value={conversation.phone} mono />
          <Row label="Email" value={conversation.email} />
          <Row label="Customer" value={conversation.name} />
          <Row label="Customer ID" value={conversation.customerId} mono />
        </div>
      </Section>

      <Section title="Timeline">
        <div className="flex flex-col">
          <Row
            label="Started"
            value={conversation.createdAt ? new Date(conversation.createdAt).toLocaleString('en-GB') : null}
            mono
          />
          <Row
            label="Last activity"
            value={conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleString('en-GB') : null}
            mono
          />
          <Row
            label="Duration"
            value={call.duration ?? duration(conversation.createdAt, conversation.updatedAt)}
            mono
          />
          <Row
            label="Messages"
            value={thread.status === 'loading' ? '…' : String(spoken.length)}
            mono
          />
        </div>
      </Section>

      <Section
        title="Artifacts"
        action={
          <div className="flex gap-1.5">
            {EXPORT_FORMATS.map(({ id, label }) => (
              <Button
                key={id}
                size="sm"
                disabled={thread.status === 'loading' || thread.data.length === 0}
                onClick={() => download(id)}
              >
                <IconDownload size={12} />
                {label}
              </Button>
            ))}
          </div>
        }
      >
        {(call.hasRecording || conversation.channel === 'Phone') && (
          <div className="mb-4">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
              Call recording
            </p>
            <RecordingPlayer conversationId={conversation.id} />
          </div>
        )}
        <p className="text-xs leading-relaxed text-ink-3">
          Export the transcript as JSON, plain text or Markdown.
        </p>
      </Section>
    </div>
  )
}
