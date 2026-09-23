import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from './ui/Card'
import DataTable, { type Column } from './ui/DataTable'
import Button from './ui/Button'
import Dropdown, { MenuItem } from './ui/Dropdown'
import Badge, { StatusBadge } from './ui/Badge'
import { ChipGroup, DateRange, SearchInput } from './ui/Field'
import { EmptyState } from './ui/States'
import {
  IconAlert,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconFlag,
  IconMood,
  IconX,
  channelIcon,
} from './icons'
import { cn } from '../lib/cn'
import { dateTime } from '../lib/format'
import { getCases } from '../lib/api'
import { useResource } from '../lib/useResource'
import type { Attribution, Case, CaseFilters } from '../lib/types'

const STATUSES = ['All', 'active', 'ended', 'resolved', 'escalated', 'abandoned']
const CHANNELS = ['All', 'web', 'phone', 'whatsapp', 'sms', 'email']
const ORIGINATORS = ['All', 'system', 'customer', 'agent']
const PAGE_SIZE = 25

const SENTIMENT: Record<string, { tone: string; mood: 'positive' | 'neutral' | 'negative' }> = {
  positive: { tone: 'text-ok', mood: 'positive' },
  negative: { tone: 'text-danger', mood: 'negative' },
  neutral: { tone: 'text-ink-3', mood: 'neutral' },
}

/**
 * Who handled the case.
 *
 * Three states, not two. "No agent matched" and "the agent was deleted" are
 * different facts — the first means nobody took it, the second means somebody
 * did and the record of who has gone. Showing both as "unassigned" would
 * report a handled conversation as abandoned.
 */
function Agent({ agent }: { agent: Attribution }) {
  if (agent.kind === 'agent') {
    return (
      <span className="truncate text-[12px] font-medium text-brand" title={agent.name}>
        {agent.name}
      </span>
    )
  }
  if (agent.kind === 'deleted') {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 italic">
        <IconAlert size={10} className="shrink-0" />
        Agent deleted
      </span>
    )
  }
  return <span className="text-[11.5px] text-ink-4">No agent matched</span>
}

/** The AI's verdict, which is not the ticket's status. */
function Verdict({ c }: { c: Case }) {
  if (c.resolved === null && !c.sentiment && !c.qa) {
    // Not judged yet. A blank would read as "judged, and found nothing".
    return <span className="text-[11.5px] text-ink-4 italic">Not scored yet</span>
  }

  const s = c.sentiment ? (SENTIMENT[c.sentiment] ?? SENTIMENT.neutral!) : null

  return (
    <div className="flex flex-col items-start gap-1">
      {s && c.sentiment && (
        <span className={cn('inline-flex items-center gap-1 font-medium', s.tone)}>
          <IconMood mood={s.mood} size={13} />
          {c.sentiment}
        </span>
      )}

      {c.resolved !== null && (
        <span
          className={cn(
            'inline-flex items-center gap-1 font-medium',
            c.resolved ? 'text-ok' : 'text-danger',
          )}
        >
          {c.resolved ? <IconCheck size={12} /> : <IconX size={12} />}
          {c.resolved ? 'Resolved' : 'Unresolved'}
        </span>
      )}

      {c.needsFollowUp && (
        <Badge tone="danger" size="sm">
          <IconFlag size={10} />
          Needs follow-up
        </Badge>
      )}

      {c.qaOverall !== null && <span className="text-ink-3">QA {c.qaOverall}/10</span>}
    </div>
  )
}

/** Saves a Blob without leaving the page. */
function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const csvCell = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`

/**
 * One case, as a file.
 *
 * The JSON is the row as the workspace described it; the CSV flattens it for a
 * spreadsheet. Both are per row rather than per page, because the use is
 * "send me this one conversation", not "export the log".
 */
function ExportMenu({ c }: { c: Case }) {
  const flat: Record<string, string | number> = {
    case_id: c.id,
    started: c.createdAt ?? '',
    customer: c.who,
    email: c.email,
    phone: c.phone,
    channel: c.channel,
    status: c.status,
    // The two absences, preserved rather than flattened into one word.
    handled_by:
      c.agent.kind === 'agent'
        ? c.agent.name
        : c.agent.kind === 'deleted'
          ? '(agent deleted)'
          : '(no agent matched)',
    summary: c.summary,
    // Empty where unscored, not "false" — a case nobody judged is not a case
    // judged unresolved.
    resolved: c.resolved === null ? '' : String(c.resolved),
    resolution_reason: c.resolutionReason,
    sentiment: c.sentiment ?? '',
    needs_followup: String(c.needsFollowUp),
    qa_overall: c.qaOverall ?? '',
  }

  const pick = (format: string) => {
    if (format === 'json') {
      save(`case-${c.ref}.json`, JSON.stringify(c, null, 2), 'application/json')
    } else {
      const keys = Object.keys(flat)
      save(
        `case-${c.ref}.csv`,
        `${keys.join(',')}
${keys.map((k) => csvCell(flat[k])).join(',')}
`,
        'text/csv',
      )
    }
  }

  return (
    <Dropdown
      menuClassName="w-28"
      button={({ open, toggle }) => (
        <Button size="sm" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          Export
          <IconChevronDown size={12} />
        </Button>
      )}
    >
      {({ close }) =>
        (
          [
            ['json', 'JSON'],
            ['csv', 'CSV'],
          ] as const
        ).map(([id, label]) => (
          <MenuItem
            key={id}
            onClick={() => {
              pick(id)
              close()
            }}
          >
            {label}
          </MenuItem>
        ))
      }
    </Dropdown>
  )
}

/**
 * Every conversation, with the AI's scoring beside the ticket's status.
 *
 * Filtered and paged by the workspace rather than the browser. Every filter is
 * applied before paging upstream, so the total is the total of what matched —
 * the only way the footer can honestly say "25 of 315". Filtering rows the
 * browser already holds would report the size of the page instead.
 *
 * This ran on invented rows for months, badged "Mock data", because nothing
 * scored a conversation. It is real now.
 */
export default function ConversationLog() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('All')
  const [channel, setChannel] = useState('All')
  const [originator, setOriginator] = useState('All')
  const [followUp, setFollowUp] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  // Debounced, so typing a name is one request at the end rather than one per
  // keystroke against a workspace that pages 315 rows.
  const [query, setQuery] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const filters: CaseFilters = {
    q: query || undefined,
    status: status === 'All' ? undefined : status,
    channel: channel === 'All' ? undefined : channel,
    originator: originator === 'All' ? undefined : originator,
    needs_followup: followUp ? 'true' : undefined,
    created_after: from || undefined,
    created_before: to || undefined,
  }
  const key = JSON.stringify(filters)

  // Any change of filter invalidates the page number: page 7 of a narrower
  // result may not exist, and the API would answer with nothing.
  useEffect(() => setPage(1), [key])

  const load = useCallback(
    (signal: AbortSignal) => getCases(JSON.parse(key) as CaseFilters, page, PAGE_SIZE, signal),
    [key, page],
  )
  const { data, status: loadState, error, reload } = useResource(
    load,
    { cases: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 },
    [key, page],
  )

  const loading = loadState === 'loading'
  const first = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1
  const last = Math.min(data.page * data.pageSize, data.total)

  const columns: Column<Case>[] = [
    {
      key: 'created_at',
      header: 'Started',
      width: 116,
      render: (c) => <span className="whitespace-nowrap">{dateTime(c.createdAt)}</span>,
    },
    {
      key: 'who',
      header: 'Customer',
      width: 190,
      render: (c) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-semibold" title={c.who}>
            {c.who}
          </span>
          {(c.phone || c.email) && (
            <span className="truncate font-mono text-[10.5px] text-ink-3">
              {c.phone || c.email}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 104,
      render: (c) => {
        const Icon = channelIcon[c.channel] ?? IconChat
        return (
          <Badge tone="muted" size="sm">
            <Icon size={10} />
            {c.channel}
          </Badge>
        )
      },
    },
    {
      key: 'agent',
      header: 'Handled by',
      width: 150,
      render: (c) => <Agent agent={c.agent} />,
    },
    {
      key: 'summary',
      header: 'Summary',
      width: 240,
      muted: true,
      render: (c) =>
        c.summary ? (
          <span className="line-clamp-3 break-words">{c.summary}</span>
        ) : (
          <span className="text-ink-4 italic">Written at close</span>
        ),
    },
    {
      key: 'verdict',
      header: 'AI verdict',
      width: 160,
      render: (c) => <Verdict c={c} />,
    },
    {
      // The ticket lifecycle, deliberately its own column: a conversation can
      // be ended without being resolved, and one reading cannot carry both.
      key: 'status',
      header: 'Status',
      width: 104,
      render: (c) => <StatusBadge label={c.status} size="sm" />,
    },
    { key: 'export', header: 'Export', width: 96, render: (c) => <ExportMenu c={c} /> },
    {
      key: 'actions',
      header: '',
      width: 72,
      render: (c) => (
        // A case IS a conversation, so its id opens the transcript directly.
        <Link to={`/conversations/${c.id}`}>
          <Button size="sm">View</Button>
        </Link>
      ),
    },
  ]

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">Conversation log</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            Every conversation with its AI scoring and ticket status
          </p>
        </div>
        {!loading && data.total > 0 && (
          <span className="font-mono text-[11.5px] text-ink-3">
            {first}–{last} of {data.total}
          </span>
        )}
      </div>

      <Card className="flex flex-col gap-2.5 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SearchInput
            label="Search cases"
            placeholder="Name, email, phone or case id"
            value={q}
            onChange={setQ}
            className="w-full sm:w-64"
          />
          <ChipGroup label="Filter by status" options={STATUSES} value={status} onChange={setStatus} />
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <ChipGroup label="Filter by channel" options={CHANNELS} value={channel} onChange={setChannel} />
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <ChipGroup
            label="Filter by originator"
            options={ORIGINATORS}
            value={originator}
            onChange={setOriginator}
          />
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <button
            type="button"
            aria-pressed={followUp}
            onClick={() => setFollowUp((v) => !v)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium transition-colors',
              followUp
                ? 'border-danger bg-danger text-white'
                : 'border-line-strong bg-surface text-ink-2 hover:border-brand-line hover:text-brand',
            )}
          >
            <IconFlag size={10} />
            Needs follow-up
          </button>
        </div>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </Card>

      <DataTable
        dense={false}
        columns={columns}
        rows={data.cases}
        rowKey={(c) => c.id}
        loading={loading}
        error={loadState === 'error' ? error : null}
        onRetry={reload}
        empty={
          <EmptyState
            icon={IconChat}
            title="No conversations match these filters"
            note="Clear a filter, or widen the date range."
          />
        }
        footer={
          data.totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 px-1">
              <span className="font-mono text-[11.5px] text-ink-3">
                Page {data.page} of {data.totalPages}
              </span>
              <span className="flex gap-1.5">
                <Button
                  size="sm"
                  disabled={data.page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  disabled={data.page >= data.totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </span>
            </div>
          ) : null
        }
      />
    </section>
  )
}
