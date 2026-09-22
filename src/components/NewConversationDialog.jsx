import { useMemo, useState } from 'react'
import { useResource } from '../lib/useResource'
import { getAgentsWithChannels } from '../lib/api'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { FormField, controlClass } from './ui/Field'
import { IconChat, IconMail, IconPhone, IconPlay, IconSms } from './icons'
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
 * Start a new outbound conversation.
 *
 * The agent list is real: it offers the published agents that handle the
 * chosen channel, and says so plainly when none do rather than presenting an
 * empty dropdown. Nothing is sent yet — the workspace has no endpoint for
 * starting a conversation, so Start is wired to `onStart` and left to the
 * caller.
 */
export default function NewConversationDialog({ open, onClose, onStart }) {
  const [channel, setChannel] = useState(CHANNELS[0])
  const [agentId, setAgentId] = useState('')
  const [contact, setContact] = useState('')
  const [opening, setOpening] = useState('')

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

  const pickChannel = (next) => {
    setChannel(next)
    setAgentId('') // an agent for one channel means nothing on another
  }

  return (
    <Modal
      open={open}
      title="Start a new conversation"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!ready}
            title={none ? 'No published agent handles this channel' : undefined}
            onClick={() =>
              onStart?.({ channel: channel.id, agentId, contact: contact.trim(), opening: opening.trim() })
            }
          >
            Start
            <IconPlay size={11} />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
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
          hint={none ? `Publish a workflow with a “${channel.trigger}” trigger node to enable this channel.` : undefined}
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
