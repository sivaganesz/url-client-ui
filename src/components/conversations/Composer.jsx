import { useState } from 'react'
import Button from '../ui/Button'
import { IconChat, IconMail, IconSms } from '../icons'
import { cn } from '../../lib/cn'
import { startOutbound } from '../../lib/api'

/** Grows with the draft up to this height, then scrolls. */
const COMPOSER_MAX_H = 140

/**
 * Channels the composer can send on.
 *
 * `needs` is the contact detail the message is addressed to; `label` doubles
 * as the name the agent's triggers and senders are reported under.
 */
const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: IconChat, needs: 'phone' },
  { id: 'email', label: 'Email', icon: IconMail, needs: 'email' },
  { id: 'sms', label: 'SMS', icon: IconSms, needs: 'phone' },
]

/** A channel chip. Picks the channel; it never sends on its own. */
function ChannelChip({ icon: Icon, label, selected, disabled, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed border-line bg-sunken text-ink-4'
          : selected
            ? 'border-brand bg-brand text-white'
            : 'border-line-strong bg-surface text-ink-2 hover:border-brand-line hover:bg-brand-soft hover:text-brand',
      )}
    >
      <Icon size={12} />
      {label}
    </button>
  )
}

/**
 * Message composer: type, pick a channel, then Send.
 *
 * Sends through POST /outbound as the conversation's own agent, which is what
 * continuing a thread means on a text channel. A chip is only usable when the
 * conversation has the contact detail AND the agent has a trigger for that
 * channel — the API rejects the rest, and a disabled chip that says why beats
 * a request that fails after you have typed a message.
 */
export default function Composer({ conversation, reach }) {
  const [draft, setDraft] = useState('')
  const [channel, setChannel] = useState(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const tel = conversation.phone ? conversation.phone.replace(/[^\d+]/g, '') : null
  const email = conversation.email || null
  const have = { phone: Boolean(tel), email: Boolean(email) }

  const ready = Boolean(draft.trim()) && Boolean(channel) && !sending

  /** Why this chip can't be used, or null when it can. */
  const blocked = (c) => {
    if (!have[c.needs]) {
      return `No ${c.needs === 'phone' ? 'phone number' : 'email address'} on this conversation`
    }
    if (!conversation.agentId) return 'This conversation has no agent'
    if (reach.status === 'loading') return 'Checking what this agent can send…'
    if (!reach.data.channels.includes(c.label)) {
      return `${conversation.agent ?? 'This agent'} has no ${c.label} trigger`
    }
    return null
  }

  const send = async () => {
    if (!ready) return
    setResult(null)
    setSending(true)
    try {
      const picked = CHANNELS.find((c) => c.id === channel)
      const r = await startOutbound({
        agentId: conversation.agentId,
        channel,
        to: picked.needs === 'phone' ? tel : email,
        openingMessage: draft.trim(),
        customerId: conversation.customerId || undefined,
      })
      // The request succeeded either way; whether anything left the building
      // is a separate question, and the one worth reporting.
      setResult(
        r.sendAuthorized
          ? { ok: true, text: `Sent on ${picked.label} to ${picked.needs === 'phone' ? tel : email}` }
          : {
              ok: false,
              text: `Conversation ran, but ${conversation.agent ?? 'this agent'} has no ${picked.label} sender action — nothing was sent.`,
            },
      )
      if (r.sendAuthorized) {
        setDraft('')
        setChannel(null)
      }
    } catch (err) {
      setResult({ ok: false, text: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="shrink-0 border-t border-line bg-surface px-4 py-3 sm:px-5">
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {CHANNELS.map((c) => {
          const why = blocked(c)
          return (
            <ChannelChip
              key={c.id}
              icon={c.icon}
              label={c.label}
              selected={channel === c.id}
              disabled={Boolean(why)}
              title={why ?? `Send on ${c.label}`}
              onClick={() => {
                setChannel((prev) => (prev === c.id ? null : c.id))
                setResult(null)
              }}
            />
          )
        })}
      </div>

      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">
          Write a message
        </label>
        <textarea
          id="composer"
          rows={1}
          value={draft}
          placeholder="Write a message…"
          onChange={(e) => {
            setDraft(e.target.value)
            setResult(null)
            const el = e.target
            el.style.height = 'auto'
            const needed = el.scrollHeight
            el.style.height = `${Math.min(needed, COMPOSER_MAX_H)}px`
            el.style.overflowY = needed > COMPOSER_MAX_H ? 'auto' : 'hidden'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          style={{ maxHeight: COMPOSER_MAX_H, overflowY: 'hidden' }}
          className="min-h-10 flex-1 resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-4 focus:border-brand focus:outline-none"
        />
        <Button
          variant="primary"
          size="md"
          disabled={!ready}
          onClick={send}
          title={
            !draft.trim() ? 'Write a message first' : !channel ? 'Pick a channel first' : undefined
          }
        >
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>

      {result && (
        <p className={cn('mt-2 text-[11.5px]', result.ok ? 'text-ok' : 'text-danger')}>
          {result.text}
        </p>
      )}
    </div>
  )
}

