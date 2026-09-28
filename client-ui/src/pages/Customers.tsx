import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import Avatar from '../components/ui/Avatar'
import Badge, { StatusBadge } from '../components/ui/Badge'
import DataBanner from '../components/ui/DataBanner'
import { ChipGroup, SearchInput, Tabs } from '../components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { IconChat, IconChevronLeft, IconChevronRight, channelIcon } from '../components/icons'
import { cn } from '../lib/cn'
import { dateTime, num, pct } from '../lib/format'
import { useResource } from '../lib/useResource'
import {
  getCustomerConversations,
  getCustomerDetails,
  getCustomers,
  timeAgo,
} from '../lib/api'
import type { ApiConversation, ApiCustomer, ApiCustomerDetails, ShellContext } from '../lib/types'

/**
 * One customer, everything the workspace knows about them.
 *
 * Two panes, like Conversations: who there is on the left, one of them on the
 * right. The figures on the right are the workspace's own — see
 * getCustomerDetails for why they are not added up here.
 */
export default function Customers() {
  const { openDrawer } = useOutletContext<ShellContext>()
  const { id } = useParams()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')

  const {
    data: customers,
    status,
    error,
    reload,
  } = useResource<ApiCustomer[]>(getCustomers, [], [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) =>
      [c.name, c.phone, c.email, c.id].some((v) => String(v ?? '').toLowerCase().includes(q)),
    )
  }, [customers, query])

  const selected = id ?? null

  return (
    <div className="flex min-h-0 flex-1">
      <h1 className="sr-only">Customers</h1>

      {/* ── list ───────────────────────────────────────────── */}
      <aside
        className={cn(
          'w-full shrink-0 flex-col border-r border-line bg-surface md:flex md:w-[20rem]',
          selected ? 'hidden' : 'flex',
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line p-3">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={openDrawer}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-muted-bg lg:hidden"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <SearchInput
            label="Search customers by name, number or email"
            placeholder="Search customers"
            value={query}
            onChange={setQuery}
            className="min-w-0 flex-1"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {status === 'loading' && (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          )}

          {status === 'error' && <ErrorState error={error} onRetry={reload} />}

          {status === 'ready' && matches.length === 0 && (
            <EmptyState
              title={query ? 'Nobody matches that' : 'No customers yet'}
              note={
                query
                  ? 'Try a name, a number or an email address.'
                  : 'A customer appears here the first time they reach you.'
              }
            />
          )}

          {status === 'ready' &&
            matches.map((c) => (
              <Link
                key={c.id}
                to={`/customers/${c.id}`}
                className={cn(
                  'flex items-center gap-2.5 border-b border-line/60 px-3 py-2.5 transition-colors',
                  c.id === selected ? 'bg-brand-soft' : 'hover:bg-sunken',
                )}
              >
                <Avatar name={c.name || 'Anonymous'} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">
                    {c.name || 'Anonymous'}
                  </span>
                  {/* An id is not a way of reaching anybody, and a customer with
                      neither number nor address is better described than labelled with
                      one. */}
                  <span
                    className={cn(
                      'block truncate text-[11px] text-ink-3',
                      (c.phone || c.email) && 'font-mono',
                    )}
                  >
                    {c.phone || c.email || 'No contact details'}
                  </span>
                </span>
              </Link>
            ))}
        </div>

        {status === 'ready' && (
          <div className="shrink-0 border-t border-line px-3 py-2 text-[11px] text-ink-3">
            {num(matches.length)}
            {matches.length === customers.length ? '' : ` of ${num(customers.length)}`} customer
            {matches.length === 1 ? '' : 's'}
          </div>
        )}
      </aside>

      {/* ── detail ─────────────────────────────────────────── */}
      <section
        className={cn('min-w-0 flex-1 flex-col bg-canvas md:flex', selected ? 'flex' : 'hidden')}
      >
        {!selected ? (
          <EmptyState
            className="flex-1"
            icon={IconChat}
            title="Select a customer"
            note="Pick someone to see what the workspace knows about them."
          />
        ) : (
          <CustomerDetail
            key={selected}
            customerId={selected}
            onBack={() => navigate('/customers')}
          />
        )}
      </section>
    </div>
  )
}

/** Profile and Communication for one customer. */
function CustomerDetail({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const [tab, setTab] = useState('profile')

  const {
    data: details,
    status,
    error,
    reload,
  } = useResource<ApiCustomerDetails | null>(
    (signal) => getCustomerDetails(customerId, signal),
    null,
    [customerId],
  )

  const customer = details?.customer
  const name = customer?.name || 'Anonymous'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line bg-surface px-4 pt-3 sm:px-5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to customers"
            className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-muted-bg md:hidden"
          >
            <IconChevronLeft size={16} />
          </button>

          <Avatar name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold">{name}</h2>
            <p className="truncate font-mono text-[11.5px] text-ink-3">
              {customer?.phone || customer?.email || customerId}
            </p>
          </div>

          {(customer?.tags?.length ?? 0) > 0 && (
            <div className="hidden shrink-0 gap-1 sm:flex">
              {customer!.tags!.slice(0, 3).map((t: string) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          )}
        </div>

        <Tabs
          tabs={[
            { id: 'profile', label: 'Profile' },
            { id: 'communication', label: 'Communication' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
        {status === 'error' ? (
          <DataBanner status={status} error={error} onRetry={reload} />
        ) : tab === 'profile' ? (
          <Profile details={details} loading={status === 'loading'} />
        ) : (
          <Communication customerId={customerId} details={details} />
        )}
      </div>
    </div>
  )
}

function Profile({
  details,
  loading,
}: {
  details: ApiCustomerDetails | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (!details) {
    return <EmptyState title="Customer not found" note="This customer is no longer in the workspace." />
  }

  const { customer, stats, insights } = details
  const { resolution } = insights

  return (
    <div className="flex flex-col gap-4">
      <Section title="Quick stats">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Conversations" value={num(stats.conversation_count)} />
          <Stat label="Channels" value={num(stats.channels.length)} />
          <Stat label="Last active" value={timeAgo(stats.last_active_at) || '—'} />
          <Stat
            label="Since"
            value={
              stats.first_active_at
                ? new Date(stats.first_active_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—'
            }
          />
        </div>

        {stats.channels.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stats.channels.map((c) => (
              <ChannelChip key={c} channel={c} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Identity">
        <dl className="divide-y divide-line">
          <Row label="Name" value={customer.name || '—'} />
          <Row label="Phone" value={customer.phone || '—'} mono />
          <Row label="Email" value={customer.email || '—'} />
          <Row label="Language" value={(customer.preferred_language as string) || '—'} />
          <Row label="Customer ID" value={customer.id} mono />
        </dl>
      </Section>

      <Section title="Insights">
        <p className="mb-2 text-[11.5px] text-ink-3">
          Across all {num(resolution.total)} conversation{resolution.total === 1 ? '' : 's'}.
        </p>

        <div className="flex flex-col gap-1.5">
          {insights.channel_mix.map((m) => (
            <ChannelBar
              key={m.channel}
              channel={m.channel}
              count={m.count}
              total={resolution.total || 1}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Resolved" value={num(resolution.resolved)} />
          <Stat label="Escalated" value={num(resolution.escalated)} />
          <Stat label="Abandoned" value={num(resolution.abandoned)} />
          {/* Already a percentage where it comes from — 3.49 means 3.49%. */}
          <Stat label="Resolution rate" value={pct(resolution.resolution_rate / 100)} />
        </div>
      </Section>
    </div>
  )
}

/**
 * What the platform will filter a conversation list by.
 *
 * `ended` is one of its statuses too and is deliberately not offered: it
 * says a conversation stopped, not how it went, and it covers most of them
 * — a chip that selects nearly everything is not a filter.
 */
const STATUSES = ['All', 'Active', 'Resolved', 'Escalated', 'Abandoned'] as const
type Status = (typeof STATUSES)[number]

/**
 * How many conversations this filter should eventually reach.
 *
 * From the same insights the Profile tab shows, so the two halves of this
 * page cannot disagree about a number they both have. The list itself only
 * knows how many it has fetched.
 */
function totalFor(details: ApiCustomerDetails | null, filter: Status): number | null {
  const r = details?.insights.resolution
  if (!r) return null
  return {
    All: r.total,
    Active: r.active,
    Resolved: r.resolved,
    Escalated: r.escalated,
    Abandoned: r.abandoned,
  }[filter]
}

/** Every conversation this customer has had, newest first. */
function Communication({
  customerId,
  details,
}: {
  customerId: string
  details: ApiCustomerDetails | null
}) {
  const [filter, setFilter] = useState<Status>('All')

  return (
    <>
      <ChipGroup
        label="Filter conversations by status"
        options={STATUSES}
        value={filter}
        onChange={setFilter}
        className="mb-3"
      />
      {/*
        Keyed, so changing the filter starts a fresh list rather than
        emptying the old one from inside an effect. The chips stay put,
        because a filter that removes the way back to itself is a trap.
      */}
      <ConversationPages
        key={`${customerId}|${filter}`}
        customerId={customerId}
        filter={filter}
        total={totalFor(details, filter)}
      />
    </>
  )
}

/**
 * The list, fifty at a time.
 *
 * Scrolling to the end fetches the next page; the button underneath does the
 * same thing and says how far along the list is, for anyone who would rather
 * press something than trust a scroll, and for when the observer cannot run.
 */
function ConversationPages({
  customerId,
  filter,
  total,
}: {
  customerId: string
  filter: Status
  total: number | null
}) {
  const status = filter === 'All' ? undefined : filter.toLowerCase()

  /**
   * The first page through useResource, the rest by hand.
   *
   * Not by hand as well: sharedGet counts who is waiting on a request and
   * aborts it when the last of them leaves, so a component that mounts,
   * unmounts and mounts again — which is every component in development —
   * can attach to a promise the first mount has already aborted. useResource
   * knows that dance. Fetching the first page here instead produced an empty
   * list and "This customer has not been in touch" for a customer with ninety
   * conversations.
   */
  const {
    data: firstPage,
    status: state,
    error,
    reload,
  } = useResource(
    (signal) => getCustomerConversations(customerId, { status }, signal),
    { rows: [] as ApiConversation[], cursor: null as string | null },
    [customerId, status],
  )

  /** Pages after the first, and where they left off. Null until one is asked for. */
  const [tail, setTail] = useState<{ rows: ApiConversation[]; cursor: string | null } | null>(
    null,
  )
  const [fetching, setFetching] = useState(false)
  const [tailError, setTailError] = useState<Error | null>(null)

  const rows = tail ? [...firstPage.rows, ...tail.rows] : firstPage.rows
  const cursor = tail ? tail.cursor : firstPage.cursor

  const more = useCallback(() => {
    if (!cursor || fetching) return
    setFetching(true)
    setTailError(null)
    getCustomerConversations(customerId, { status, cursor })
      .then((page) => {
        setTail((had) => ({
          rows: [...(had?.rows ?? []), ...page.rows],
          cursor: page.cursor,
        }))
      })
      .catch((err: Error) => setTailError(err))
      .finally(() => setFetching(false))
  }, [customerId, status, cursor, fetching])


  if (state === 'loading') {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }

  if (state === 'error') {
    return <ErrorState error={error} onRetry={reload} />
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={IconChat}
        title={filter === 'All' ? 'Nothing yet' : `No ${filter.toLowerCase()} conversations`}
        note={
          filter === 'All'
            ? 'This customer has not been in touch.'
            : 'They have been in touch, just not on this status. Try All.'
        }
      />
    )
  }

  return (
    <>
      <div className="flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {rows.map((c) => (
          <Link
            key={c.id}
            to={`/conversations/${c.id}`}
            className="flex items-center gap-3 border-b border-line/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-sunken"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-1.5">
                {(c.channels?.length ? c.channels : [c.channel_started])
                  .filter(Boolean)
                  .map((ch) => (
                    <ChannelChip key={String(ch)} channel={String(ch)} />
                  ))}
                {c.status && <StatusBadge label={label(c.status)} />}
              </span>
              {c.summary && (
                <span className="line-clamp-1 text-[11.5px] text-ink-2">{c.summary}</span>
              )}
              <span className="text-[11px] text-ink-3" title={dateTime(c.created_at)}>
                Started {timeAgo(c.created_at)}
                {c.updated_at ? ` · last activity ${timeAgo(c.updated_at)}` : ''}
              </span>
            </span>
            <IconChevronRight size={14} className="shrink-0 text-ink-4" />
          </Link>
        ))}
      </div>

      <div className="pt-3">
        {cursor ? (
          <button
            type="button"
            onClick={more}
            disabled={fetching}
            className="w-full rounded-lg border border-line-strong bg-surface py-2 text-[11.5px] font-medium text-ink-2 transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand disabled:cursor-default disabled:opacity-60"
          >
            {fetching
              ? 'Loading…'
              : `Load more (${num(rows.length)}${total ? ` of ${num(total)}` : ''})`}
          </button>
        ) : (
          <p className="text-center text-[11px] text-ink-3">
            {num(rows.length)} conversation{rows.length === 1 ? '' : 's'}
          </p>
        )}

        {tailError && (
          <p role="alert" className="mt-2 text-center text-[11px] text-danger">
            Could not load any more. {tailError.message}
          </p>
        )}
      </div>
    </>
  )
}

/* ── small parts ──────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h3 className="mb-3 text-[9.5px] font-semibold tracking-[0.05em] text-ink-3 uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-sunken px-3 py-2.5">
      <p className="truncate text-[15px] font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-[10.5px] text-ink-3">{label}</p>
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-[11.5px] text-ink-3">{label}</dt>
      <dd className={cn('min-w-0 truncate text-[12.5px]', mono && 'font-mono text-[11.5px]')}>
        {value}
      </dd>
    </div>
  )
}

function ChannelChip({ channel }: { channel: string }) {
  const Icon = channelIcon[label(channel)] ?? IconChat
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-[10.5px] text-ink-2">
      <Icon size={11} />
      {label(channel)}
    </span>
  )
}

/** `web_voice` is the workspace's spelling; people read "Web voice". */
function label(channel: string): string {
  const cleaned = channel.replace(/_/g, ' ')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function ChannelBar({
  channel,
  count,
  total,
}: {
  channel: string
  count: number
  total: number
}) {
  const share = Math.round((count / total) * 100)
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-20 shrink-0 truncate text-[11.5px] text-ink-2">{label(channel)}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken">
        <span className="block h-full rounded-full bg-brand" style={{ width: `${share}%` }} />
      </span>
      <span className="w-16 shrink-0 text-right text-[11px] text-ink-3 tabular-nums">
        {num(count)} · {share}%
      </span>
    </div>
  )
}
