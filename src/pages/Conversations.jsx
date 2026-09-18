import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Avatar,
  Empty,
  FilterBar,
  IconBack,
  IconChat,
  IconMail,
  IconPhone,
  IconSearch,
  Pill,
  Problem,
  SearchBox,
  Skeleton,
  channelIcon,
} from '../components/ui'
import { cn } from '../lib/cn'
import { clock, dateLong, dayStamp, num, whenAgo } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getConversation, getConversations } from '../lib/api'

const TONE = {
  Resolved: 'good',
  Completed: 'neutral',
  'Left early': 'warn',
  'In progress': 'info',
}

const nameFor = (c) => c.customerName ?? `${c.channel} visitor`

export default function Conversations() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data, status, reload } = useResource(getConversations, [])
  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState('All')
  const [outcome, setOutcome] = useState('All')

  const channels = useMemo(
    () => ['All', ...new Set((data ?? []).map((c) => c.channel))],
    [data],
  )
  const outcomes = useMemo(
    () => ['All', ...new Set((data ?? []).map((c) => c.status))],
    [data],
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? []).filter((c) => {
      if (channel !== 'All' && c.channel !== channel) return false
      if (outcome !== 'All' && c.status !== outcome) return false
      if (!q) return true
      return [c.customerName, c.summary, c.reference, c.customerPhone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [data, query, channel, outcome])

  const filterGroups = [
    { key: 'channel', label: 'Channel', options: channels, value: channel, onChange: setChannel },
    { key: 'outcome', label: 'Outcome', options: outcomes, value: outcome, onChange: setOutcome },
  ]

  const selected = (data ?? []).find((c) => c.id === id) ?? null

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Problem onRetry={reload} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── list ──────────────────────────────────────────── */}
      <aside
        className={cn(
          'min-h-0 w-full shrink-0 flex-col border-r border-rule bg-card md:flex md:w-[23rem]',
          id ? 'hidden' : 'flex',
        )}
      >
        <div className="shrink-0 border-b border-rule px-4 py-4">
          <h1 className="mb-3 text-[20px]">Conversations</h1>
          <FilterBar
            groups={filterGroups}
            search={
              <SearchBox
                label="Search conversations"
                placeholder="Search by name, phone or topic"
                value={query}
                onChange={setQuery}
              />
            }
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {status === 'loading' ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Empty
              icon={IconSearch}
              title="Nothing matches"
              note="Try a different search, or clear the filters."
            />
          ) : (
            <ul>
              {rows.map((c) => {
                const active = c.id === id
                const Icon = channelIcon[c.channel] ?? IconChat
                return (
                  <li key={c.id}>
                    <Link
                      to={`/conversations/${c.id}`}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex gap-3 border-b border-rule/70 px-4 py-3 transition-colors',
                        active ? 'bg-brand-soft' : 'hover:bg-sunk',
                      )}
                    >
                      <Avatar name={nameFor(c)} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[14px] font-semibold">{nameFor(c)}</span>
                          <span className="shrink-0 text-[11.5px] text-ink-3">
                            {whenAgo(c.lastActivityAt)}
                          </span>
                        </div>
                        <p className="truncate text-[12.5px] text-ink-3">
                          {c.summary ?? 'No summary recorded.'}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                            <Icon size={11} />
                            {c.channel}
                          </span>
                          <span className="text-ink-3">·</span>
                          <span
                            className={cn(
                              'text-[11px] font-semibold',
                              TONE[c.status] === 'good' && 'text-good',
                              TONE[c.status] === 'warn' && 'text-warn',
                              TONE[c.status] === 'info' && 'text-brand-deep',
                              TONE[c.status] === 'neutral' && 'text-ink-3',
                            )}
                          >
                            {c.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-rule px-4 py-2.5 text-center text-[12px] text-ink-3">
          {status === 'loading' ? 'Loading…' : `${rows.length} of ${data.length} conversations`}
        </div>
      </aside>

      {/* ── detail ────────────────────────────────────────── */}
      <section className={cn('min-w-0 flex-1 flex-col md:flex', id ? 'flex' : 'hidden')}>
        {!id ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <Empty
              title="Pick a conversation"
              note="Choose someone on the left to read the full exchange and its details."
            />
          </div>
        ) : (
          <Detail
            key={id}
            id={id}
            listed={selected}
            onBack={() => navigate('/conversations')}
          />
        )}
      </section>
    </div>
  )
}

/* ── detail pane ───────────────────────────────────────────── */

function Detail({ id, listed, onBack }) {
  const [tab, setTab] = useState('transcript')
  const load = useCallback(() => getConversation(id), [id])
  const { data, status, reload } = useResource(load, [id])

  const header = data?.conversation ?? listed

  if (status === 'error') {
    return (
      <div className="flex-1 overflow-auto p-6">
        <Problem onRetry={reload} />
      </div>
    )
  }

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-rule bg-card px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to list"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:bg-sunk md:hidden"
        >
          <IconBack size={18} />
        </button>
        {header && <Avatar name={nameFor(header)} size="lg" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold">{header ? nameFor(header) : '—'}</p>
          {header && (
            <p className="truncate text-[12.5px] text-ink-3">
              {[header.customerPhone, `via ${header.channel}`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {header && <Pill tone={TONE[header.status] ?? 'neutral'}>{header.status}</Pill>}
      </header>

      <div className="flex shrink-0 items-stretch gap-6 border-b border-rule bg-card px-4 sm:px-6" role="tablist">
        {[
          { id: 'transcript', label: 'Transcript' },
          { id: 'overview', label: 'Overview' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 pt-1 pb-2.5 text-[13.5px] transition-colors',
              tab === t.id
                ? 'border-brand font-semibold text-brand'
                : 'border-transparent font-medium text-ink-3 hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {status === 'loading' ? (
        <div className="flex-1 space-y-4 overflow-auto p-6">
          {[70, 52, 64, 44].map((w, i) => (
            <Skeleton
              key={i}
              className={cn('h-14', i % 2 ? 'ml-auto' : '')}
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto" role="tabpanel">
          {tab === 'transcript' ? (
            <Thread conversation={data.conversation} transcript={data.transcript} />
          ) : (
            <Metrics conversation={data.conversation} transcript={data.transcript} />
          )}
        </div>
      )}
    </>
  )
}

/* ── the exchange ──────────────────────────────────────────── */

function Thread({ conversation, transcript }) {
  if (transcript.length === 0) {
    return (
      <Empty
        title="Nothing was recorded"
        note="This conversation has no messages saved against it."
      />
    )
  }

  let lastDay = null
  const who = nameFor(conversation)

  return (
    <div className="flex flex-col gap-3 px-4 py-6 sm:px-6">
      {transcript.map((m) => {
        const day = dayStamp(m.at)
        const newDay = day !== lastDay
        lastDay = day
        return (
          <div key={m.id} className="contents">
            {newDay && (
              <p className="my-2 self-center rounded-full bg-sunk px-3 py-1 text-[11.5px] text-ink-3">
                {day}
              </p>
            )}
            {m.kind === 'note' ? (
              <p className="self-center text-[11.5px] text-ink-3">
                {m.text} · {clock(m.at)}
              </p>
            ) : (
              <div
                className={cn(
                  'flex max-w-[85%] flex-col gap-1 sm:max-w-[68%]',
                  m.kind === 'customer' ? 'items-end self-end' : 'items-start self-start',
                )}
              >
                <span className="px-1 text-[11.5px] font-medium text-ink-3">
                  {m.kind === 'customer' ? who : 'Assistant'}
                </span>
                <div
                  className={cn(
                    'px-4 py-2.5 text-[14.5px] leading-relaxed break-words shadow-soft',
                    m.kind === 'customer'
                      ? 'rounded-[16px_16px_4px_16px] bg-brand text-white'
                      : 'rounded-[16px_16px_16px_4px] border border-rule bg-card',
                  )}
                >
                  {m.text}
                </div>
                <span className="px-1 text-[11px] text-ink-3">{clock(m.at)}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── cards beneath the exchange ────────────────────────────── */

/**
 * Counts and timings computed from the transcript that's already on screen.
 *
 * Length is measured first message -> last message, not the record's
 * created_at -> updated_at: on an abandoned session those sit hours apart and
 * would report a two-minute chat as lasting all afternoon.
 */
function Metrics({ conversation: c, transcript }) {
  const said = transcript.filter((m) => m.kind !== 'note')
  const fromCustomer = said.filter((m) => m.kind === 'customer')
  const fromAssistant = said.filter((m) => m.kind === 'assistant')

  const spanSeconds =
    said.length > 1 ? Math.round((new Date(said.at(-1).at) - new Date(said[0].at)) / 1000) : 0

  const asTime = (s) => {
    if (s == null) return '—'
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
  }

  const tel = c.customerPhone ? c.customerPhone.replace(/[^d+]/g, '') : null

  const figures = [
    { value: num(said.length), label: 'Messages' },
    { value: num(fromCustomer.length), label: 'From customer' },
    { value: num(fromAssistant.length), label: 'From assistant' },
    { value: asTime(spanSeconds), label: 'Length' },
  ]

  const details = [
    ['Channel', c.channel],
    ['Handled by', c.assistant ?? 'Not recorded'],
    ['Started', dateLong(c.startedAt)],
    ['Last activity', whenAgo(c.lastActivityAt)],
    ['Reference', c.reference],
  ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      {/* The summary leads — it is the one thing a client reads first. */}
      <section className="rounded-card border border-rule bg-card p-6 shadow-soft">
        <h3 className="mb-3 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
          Summary
        </h3>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Pill tone={TONE[c.status] ?? 'neutral'}>{c.status}</Pill>
          {c.statusNote && <span className="text-[13px] text-ink-3">{c.statusNote}</span>}
        </div>
        <p className="font-serif text-[18px] leading-[1.6] text-ink sm:text-[19px]">
          {c.summary ?? 'No summary was recorded for this conversation.'}
        </p>
      </section>

      {/* One strip, evenly divided — reads as a single fact rather than
          four boxes of different heights competing with each other. */}
      <section className="mt-4 overflow-hidden rounded-card border border-rule shadow-soft">
        <dl className="grid grid-cols-2 gap-px bg-rule lg:grid-cols-4">
          {figures.map((f) => (
            <div key={f.label} className="bg-card px-4 py-4 text-center">
              <dd className="font-serif text-[26px] leading-none font-semibold tnum">{f.value}</dd>
              <dt className="mt-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                {f.label}
              </dt>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section className="rounded-card border border-rule bg-card p-5 shadow-soft lg:col-span-3">
          <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            Details
          </h3>
          <dl>
            {details.map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 border-b border-rule/60 py-2.5 last:border-b-0"
              >
                <dt className="shrink-0 text-[13px] text-ink-3">{label}</dt>
                <dd className="truncate text-right text-[13.5px] font-medium" title={String(value)}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col rounded-card border border-rule bg-card p-5 shadow-soft lg:col-span-2">
          <h3 className="mb-3 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
            Customer
          </h3>
          <div className="flex items-center gap-3">
            <Avatar name={nameFor(c)} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-semibold">{nameFor(c)}</p>
              <p className="truncate text-[12.5px] text-ink-3">
                {c.customerPhone ?? c.customerEmail ?? 'No contact details shared'}
              </p>
            </div>
          </div>

          {(tel || c.customerEmail) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-4">
              {tel && <Action href={`tel:${tel}`} icon={IconPhone} label="Call" />}
              {tel && (
                <Action
                  href={`https://wa.me/${tel.replace('+', '')}`}
                  icon={IconChat}
                  label="WhatsApp"
                />
              )}
              {c.customerEmail && (
                <Action href={`mailto:${c.customerEmail}`} icon={IconMail} label="Email" />
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Action({ href, icon: Icon, label }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-rule-strong bg-card px-3 py-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-brand-rule hover:bg-brand-soft hover:text-brand-deep"
    >
      <Icon size={14} />
      {label}
    </a>
  )
}
