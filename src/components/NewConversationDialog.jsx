import { useMemo, useState } from 'react'
import { useResource } from '../lib/useResource'
import { getAgentsWithChannels, startOutbound } from '../lib/api'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { FormField, controlClass } from './ui/Field'
import { IconAlert, IconChat, IconChevronRight, IconMail, IconPhone, IconPlay, IconSms } from './icons'
import { cn } from '../lib/cn'

/**
 * Channels a conversation can be started *on*.
 *
 * Web is deliberately absent: a web chat begins when a visitor opens the
 * widget, so there is nothing to start from this side.
 *
 * `trigger` is the node name the workspace expects on a workflow, and is what
 * the hint tells someone to publish when no agent handles the channel.
 */
const CHANNELS = [
  { id: 'SMS', label: 'SMS', trigger: 'sms', icon: IconSms, contact: 'phone' },
  { id: 'WhatsApp', label: 'WhatsApp', trigger: 'whatsapp', icon: IconChat, contact: 'phone' },
  { id: 'Email', label: 'Email', trigger: 'email', icon: IconMail, contact: 'email' },
  { id: 'Phone', label: 'Phone call', trigger: 'phone', icon: IconPhone, contact: 'phone' },
]

const CONTACT = {
  phone: { label: 'Phone number', type: 'tel', placeholder: '+91 9342022401' },
  email: { label: 'Email address', type: 'email', placeholder: 'name@example.com' },
}

/**
 * Have an agent reach out first — POST /outbound.
 *
 * This places a real call or sends a real message, so the form only enables
 * once a channel, a published agent with a trigger for it, and a destination
 * are all present.
 *
 * Three outcomes, and the third is the one worth care: the request can fail;
 * it can succeed and deliver; or it can succeed with `send_authorized: false`,
 * meaning the conversation opened and the agent ran but has no Sender action,
 * so nothing went out. That last one is a half-built agent rather than a
 * failed request, and navigating away silently would bury it.
 */
export default function NewConversationDialog({ open, onClose, onStarted }) {
  const [channel, setChannel] = useState(CHANNELS[0])
  const [agentId, setAgentId] = useState('')
  const [contact, setContact] = useState('')
  const [opening, setOpening] = useState('')

  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState(null)
  const [started, setStarted] = useState(null)

  // Loaded here rather than by the page: it costs a request per agent, and
  // nothing needs it until this dialog is on screen.
  const { data: agents, status } = useResource(getAgentsWithChannels, [], [])
  const loading = status === 'loading'

  // Only a published agent can take a conversation, and only on a channel its
  // graph has a trigger for.
  const eligible = useMemo(
    () => agents.filter((a) => a.status === 'Active' && a.channels.includes(channel.id)),
    [agents, channel],
  )

  const none = !loading && eligible.length === 0
  const field = CONTACT[channel.contact]
  const ready = !none && Boolean(agentId) && contact.trim() !== ''

  // A call delivers over the voice stream, so it needs no sender action. On the
  // text channels, a trigger without one starts a conversation that can never
  // reply — worth saying before the send, not only after.
  const picked = eligible.find((a) => a.id === agentId)
  const willNotSend =
    Boolean(picked) && channel.id !== 'Phone' && !picked.senders?.includes(channel.id)

  const pickChannel = (next) => {
    setChannel(next)
    setAgentId('') // an agent for one channel means nothing on another
    setFailure(null)
  }

  async function submit() {
    setSending(true)
    setFailure(null)
    try {
      const to = contact.trim()
      const r = {
        ...(await startOutbound({
          agentId,
          channel: channel.trigger,
          to,
          openingMessage: opening.trim() || undefined,
        })),
        // Carried back so the caller can label a call screen without
        // re-reading the form.
        to,
        agentName: picked?.name,
      }
      // Authorized: the message is on its way, so go and watch it. Otherwise
      // hold the dialog open and say what happened — the conversation exists,
      // but nothing went out, and silently navigating would hide that.
      if (r.sendAuthorized) onStarted?.(r)
      else setStarted(r)
    } catch (err) {
      setFailure(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Start a new conversation"
      onClose={onClose}
      footer={
        started ? (
          <>
            <Button variant="ghost" size="md" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" size="md" onClick={() => onStarted?.(started)}>
              Open conversation
              <IconChevronRight size={13} />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="md" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!ready || sending}
              title={none ? 'No published agent handles this channel' : undefined}
              onClick={submit}
            >
              {sending ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                  />
                  {channel.id === 'Phone' ? 'Calling…' : 'Starting…'}
                </>
              ) : (
                <>
                  {channel.id === 'Phone' ? 'Call' : 'Start'}
                  <IconPlay size={11} />
                </>
              )}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {started && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-card border border-warn/25 bg-warn-bg px-3.5 py-3"
          >
            <IconAlert size={15} className="mt-0.5 shrink-0 text-warn" />
            <div className="min-w-0 text-[11.5px] leading-relaxed">
              <p className="font-semibold text-warn">Conversation started — but nothing was sent</p>
              <p className="mt-0.5 text-ink-2">
                {picked?.name ?? 'This agent'} has no {channel.label} sender action on its canvas, so
                it ran without being able to reply. Add one and the thread will pick up from here.
              </p>
            </div>
          </div>
        )}

        {failure && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger-bg px-3.5 py-3"
          >
            <IconAlert size={15} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0 text-[11.5px] leading-relaxed">
              <p className="font-semibold text-danger">Could not reach out</p>
              <p className="mt-0.5 font-mono break-words text-ink-2">{failure}</p>
            </div>
          </div>
        )}

        <FormField label="Channel">
          {() => (
            <div
              role="group"
              aria-label="Channel"
              className="grid grid-cols-2 gap-0.5 rounded-lg border border-line-strong bg-sunken p-0.5 sm:grid-cols-4"
            >
              {CHANNELS.map((c) => {
                const on = c.id === channel.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickChannel(c)}
                    className={cn(
                      'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium transition-colors',
                      on ? 'bg-surface text-brand shadow-card' : 'text-ink-3 hover:text-ink',
                    )}
                  >
                    <c.icon size={13} />
                    {c.label}
                  </button>
                )
              })}
            </div>
          )}
        </FormField>

        <FormField
          label="Agent"
          hint={
            none
              ? `Publish a workflow with a “${channel.trigger}” trigger node to enable this channel.`
              : willNotSend
                ? `This agent has no ${channel.label} sender action, so the conversation will start but nothing will be sent.`
                : undefined
          }
          hintTone="warn"
        >
          {(id) => (
            <select
              id={id}
              value={agentId}
              disabled={none || loading}
              onChange={(e) => setAgentId(e.target.value)}
              className={cn(controlClass, 'h-10')}
            >
              {loading ? (
                <option value="">Loading agents…</option>
              ) : none ? (
                <option value="">No published workflow handles this channel</option>
              ) : (
                <>
                  <option value="">Choose an agent</option>
                  {eligible.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          )}
        </FormField>

        <FormField label={field.label}>
          {(id) => (
            <input
              id={id}
              type={field.type}
              value={contact}
              placeholder={field.placeholder}
              onChange={(e) => setContact(e.target.value)}
              className={cn(controlClass, 'h-10')}
            />
          )}
        </FormField>

        <FormField label="Opening message (optional)">
          {(id) => (
            <textarea
              id={id}
              rows={3}
              value={opening}
              placeholder="Leave empty to use the workflow’s persona greeting."
              onChange={(e) => setOpening(e.target.value)}
              className={cn(controlClass, 'resize-none py-2.5 leading-relaxed')}
            />
          )}
        </FormField>
      </div>
    </Modal>
  )
}
