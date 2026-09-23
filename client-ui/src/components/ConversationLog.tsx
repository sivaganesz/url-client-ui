import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from './ui/Card'
import DataTable, { type Column } from './ui/DataTable'
import Button from './ui/Button'
import Dropdown, { MenuItem } from './ui/Dropdown'
import Badge, { StatusBadge } from './ui/Badge'
import { ChipGroup, DateRange, SearchInput } from './ui/Field'
import Spinner from './ui/Spinner'
import TablePager from './ui/TablePager'
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
import { dateTime, num } from '../lib/format'
import { getCases, getMessages } from '../lib/api'
import { EXPORT_FORMATS, exportConversation, type ExportFormat, type ExportMeta } from '../lib/export'
import { useSession } from '../lib/session'
import { useResource } from '../lib/useResource'
import type { Attribution, Case, CaseFilters } from '../lib/types'

const STATUSES = ['All', 'active', 'ended', 'resolved', 'escalated', 'abandoned']
const CHANNELS = ['All', 'web', 'phone', 'whatsapp', 'sms', 'email']
const ORIGINATORS = ['All', 'system', 'customer', 'agent']

/**
 * Rows per page. The endpoint caps `page_size` at 100 — ask for 200 and it
 * answers with 100 and says so in `pagination.page_size` — so offering more
 * would be offering a page the workspace will not serve.
 */
const PAGE_SIZES = [10, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 25

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

/** Everything the file says about the case, minus the transcript. */
function metaOf(c: Case, stamp: Pick<ExportMeta, 'exportedBy' | 'workspace'>): ExportMeta {
  return {
    id: c.id,
    status: c.status,
    startedAt: c.createdAt,
    /**
     * `who` falls back to "Case 01a0cd50" for an anonymous conversation, which
     * is a useful column heading and a poor answer to "Customer:" in a file.
     * Recognising the fallback leaves the line out instead of printing an id
     * where a name should be.
     */
    customerName: c.who === `Case ${c.ref}` ? undefined : c.who,
    customerEmail: c.email || undefined,
    customerPhone: c.phone || undefined,
    channel: c.channel,
    // The two absences, preserved rather than flattened into one word.
    agent:
      c.agent.kind === 'agent'
        ? c.agent.name
        : c.agent.kind === 'deleted'
          ? '(agent deleted)'
          : '(no agent matched)',
    summary: c.summary || undefined,
    sentiment: c.sentiment,
    resolved: c.resolved,
    needsFollowUp: c.needsFollowUp,
    qaOverall: c.qaOverall,
    resolutionReason: c.resolutionReason || undefined,
    ...stamp,
  }
}

/**
 * One conversation, as a file.
 *
 * The transcript is fetched when a format is picked, not when the page loads —
 * a case row carries no events, and prefetching them for every row on screen
 * would be a hundred requests to serve the one export somebody eventually
 * asks for. Same three formats as the conversation page, through the same
 * exporter, so a file pulled from here matches one pulled from there.
 */
function ExportMenu({
  c,
  stamp,
}: {
  c: Case
  stamp: Pick<ExportMeta, 'exportedBy' | 'workspace'>
}) {
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [failed, setFailed] = useState(false)

  /**
   * The row unmounts when the page turns, and the fetch outlives it.
   *
   * Re-armed on mount rather than only initialised: StrictMode mounts, tears
   * down and mounts again, so a flag that is only ever cleared reads "gone"
   * for the rest of the component's life and swallows every export.
   */
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const pick = async (format: ExportFormat) => {
    setBusy(format)
    setFailed(false)
    try {
      const messages = await getMessages(c.id)
      if (!alive.current) return
      exportConversation(format, metaOf(c, stamp), messages)
    } catch {
      // Saying nothing would look like a download the browser swallowed.
      if (alive.current) setFailed(true)
    } finally {
      if (alive.current) setBusy(null)
    }
  }

  return (
    <Dropdown
      menuClassName="w-28"
      button={({ open, toggle }) => (
        <Button
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy !== null}
          title={failed ? 'The transcript would not load. Try again.' : undefined}
          onClick={toggle}
        >
          {busy ? <Spinner size={11} /> : failed ? <IconAlert size={12} className="text-danger" /> : null}
          Export
          {failed && <span className="sr-only">— the transcript would not load, try again</span>}
          <IconChevronDown size={12} />
        </Button>
      )}
    >
      {({ close }) =>
        EXPORT_FORMATS.map(({ id, label }) => (
          <MenuItem
            key={id}
            onClick={() => {
              void pick(id)
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
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // Whose data this is. Every request already resolves the workspace from the
  // session server-side; this only stamps the file so an export that travels
  // still says which customer it came from.
  const { user, workspace } = useSession()
  const stamp = { exportedBy: user?.email, workspace: workspace?.name }

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
    (signal: AbortSignal) => getCases(JSON.parse(key) as CaseFilters, page, pageSize, signal),
    [key, page, pageSize],
  )
  const { data, status: loadState, error, reload } = useResource(
    load,
    { cases: [], page: 1, pageSize, total: 0, totalPages: 0 },
    [key, page, pageSize],
  )

  const loading = loadState === 'loading'

  /**
   * The pager reads the page the workspace actually served, not the one that
   * was asked for: the rows on screen are the old page until the new one
   * arrives, and a range counted from the requested page would describe rows
   * nobody can see yet.
   */
  const pager = {
    rows: data.cases,
    sizes: PAGE_SIZES,
    perPage: pageSize,
    setPerPage: (n: number) => {
      // Page 13 of 100-row pages doesn't exist when the pages hold 10.
      setPageSize(n)
      setPage(1)
    },
    page: data.page,
    pageCount: Math.max(1, data.totalPages),
    from: (data.page - 1) * data.pageSize,
    total: data.total,
    goto: setPage,
  }

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
    {
      key: 'export',
      header: 'Export',
      width: 96,
      render: (c) => <ExportMenu c={c} stamp={stamp} />,
    },
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
        {data.total > 0 && (
          // The count of everything matching the filters, which is only
          // honest because the workspace filters before it pages.
          <span className="font-mono text-[11.5px] text-ink-3">
            {num(data.total)} {data.total === 1 ? 'conversation' : 'conversations'}
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
          // Shown from the first row rather than from the second page: the
          // page size is a control, not a consequence of having enough rows.
          data.total > 0 ? (
            <TablePager
              pager={pager}
              noun="conversations"
              loading={loading}
              className="font-mono text-[11.5px] text-ink-3"
            />
          ) : null
        }
      />
    </section>
  )
}
