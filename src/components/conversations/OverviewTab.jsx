import Button from '../ui/Button'
import Card from '../ui/Card'
import RecordingPlayer from '../RecordingPlayer'
import { IconDownload } from '../icons'
import { cn } from '../../lib/cn'
import { duration } from '../../lib/api'

function Section({ title, action, children }) {
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

function Row({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-b-0">
      <span className="shrink-0 text-xs text-ink-3">{label}</span>
      <span className={cn('truncate text-right text-[12.5px]', mono && 'font-mono tabular-nums')}>
        {value || '—'}
      </span>
    </div>
  )
}

export default function OverviewTab({ conversation, thread, spoken, call }) {
  const download = (format) => {
    const lines = thread.data.map((m) =>
      m.role === 'tool' ? `[${m.text}]` : `${m.author} (${m.time}): ${m.text}`,
    )
    let body
    let type
    let ext
    if (format === 'json') {
      body = JSON.stringify({ conversation, messages: thread.data }, null, 2)
      type = 'application/json'
      ext = 'json'
    } else if (format === 'md') {
      body = `# ${conversation.title} · ${conversation.ref}\n\n_${conversation.preview}_\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`
      type = 'text/markdown'
      ext = 'md'
    } else {
      body = `${conversation.title} · ${conversation.ref}\n\n${lines.join('\n')}\n`
      type = 'text/plain'
      ext = 'txt'
    }
    const url = URL.createObjectURL(new Blob([body], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = `conversation-${String(conversation.id).slice(0, 8)}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

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
            {['json', 'txt', 'md'].map((f) => (
              <Button
                key={f}
                size="sm"
                disabled={thread.status === 'loading' || thread.data.length === 0}
                onClick={() => download(f)}
              >
                <IconDownload size={12} />
                {f.toUpperCase()}
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
