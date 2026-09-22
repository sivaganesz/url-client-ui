import { useMemo, useState } from 'react'
import Card from './ui/Card'
import DataTable from './ui/DataTable'
import TablePager from './ui/TablePager'
import Dropdown, { MenuItem } from './ui/Dropdown'
import Button from './ui/Button'
import Badge, { StatusBadge } from './ui/Badge'
import { ChipGroup, DateRange } from './ui/Field'
import { EmptyState } from './ui/States'
import {
  IconChat,
  IconCheck,
  IconChevronDown,
  IconFlag,
  IconInbound,
  IconMood,
  IconOutbound,
  IconSystem,
  IconX,
  channelIcon,
} from './icons'
import { cn } from '../lib/cn'
import { usePagination } from '../lib/usePagination'
import { dateTime } from '../lib/format'

const STATUSES = ['All', 'Active', 'Ended', 'Resolved', 'Escalated', 'Follow-up']
const DIRECTIONS = ['All', 'Customer', 'Agent']
const CHANNELS = ['Web', 'WhatsApp', 'SMS', 'Phone', 'Email']
const PAGE_SIZES = [10, 25, 50]

/** Who moved last. The arrow direction is the whole point, so it carries a label. */
const MOVERS = {
  customer: { label: 'Customer', icon: IconInbound },
  agent: { label: 'Agent', icon: IconOutbound },
  system: { label: 'System', icon: IconSystem },
}
/** Real data will eventually arrive here; an unknown mover shouldn't throw. */
const moverOf = (d) => MOVERS[d] ?? { label: 'Unknown', icon: IconSystem }

const SENTIMENT_TONE = { Positive: 'text-ok', Negative: 'text-danger', Neutral: 'text-ink-3' }
const MOOD = { Positive: 'positive', Negative: 'negative', Neutral: 'neutral' }

/** Save a Blob without leaving the page. */
function save(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const csvCell = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`

function ExportMenu({ row }) {
  const flat = {
    date: row.at,
    who: row.who,
    direction: row.direction,
    channel: row.channel,
    triggered_by: row.triggeredBy,
    summary: row.summary ?? '',
    sentiment: row.ai?.sentiment ?? '',
    solved: row.ai ? String(row.ai.solved) : '',
    needs_follow_up: row.ai ? String(row.ai.followUp) : '',
    qa_score: row.ai?.qaScore ?? '',
    qa_note: row.ai?.note ?? '',
    ticket_status: row.ticketStatus,
  }

  const pick = (format) => {
    if (format === 'json') {
      save(`conversation-${row.id}.json`, JSON.stringify(row, null, 2), 'application/json')
    } else {
      const keys = Object.keys(flat)
      const csv = `${keys.join(',')}\n${keys.map((k) => csvCell(flat[k])).join(',')}\n`
      save(`conversation-${row.id}.csv`, csv, 'text/csv')
    }
  }

  return (
    <Dropdown
      menuClassName="w-28"
      button={({ open, toggle }) => (
        <Button size="sm" className="px-2" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          Export
          <IconChevronDown size={12} />
        </Button>
      )}
    >
      {({ close }) =>
        [
          ['json', 'JSON'],
          ['csv', 'CSV'],
        ].map(([id, label]) => (
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

function AiStatus({ ai }) {
  if (!ai) return <span className="text-ink-4 italic">Pending</span>

  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className={cn('inline-flex items-center gap-1 font-medium', SENTIMENT_TONE[ai.sentiment])}>
        <IconMood mood={MOOD[ai.sentiment]} size={13} />
        {ai.sentiment}
      </span>

      <span
        className={cn('inline-flex items-center gap-1 font-medium', ai.solved ? 'text-ok' : 'text-danger')}
      >
        {ai.solved ? <IconCheck size={12} /> : <IconX size={12} />}
        {ai.solved ? 'Solved' : 'Unsolved'}
      </span>

      {ai.followUp && (
        <Badge tone="danger" size="sm">
          <IconFlag size={10} />
          Needs follow-up
        </Badge>
      )}

      <span className="text-ink-3">QA score {ai.qaScore}/10</span>

      {ai.note && <p className="text-[11px] leading-relaxed text-ink-3 italic">“{ai.note}”</p>}
    </div>
  )
}

/**
 * Conversation log — every conversation with its AI scoring and ticket state.
 *
 * Runs on mock data. The workspace scores no conversation and raises no
 * ticket, so the rows, the QA notes and the sentiment are all invented. The
 * filtering, the date range and the paging are real, so the interaction can
 * be reviewed before the API exists.
 */
export default function ConversationLog({ rows }) {
  const [status, setStatus] = useState('All')
  const [direction, setDirection] = useState('All')
  const [channels, setChannels] = useState([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const matches = useMemo(() => {
    return rows.filter((r) => {
      if (status === 'Follow-up' ? !r.ai?.followUp : status !== 'All' && r.ticketStatus !== status)
        return false
      if (direction !== 'All' && moverOf(r.direction).label !== direction) return false
      if (channels.length && !channels.includes(r.channel)) return false
      // Native date inputs give yyyy-mm-dd, which compares correctly as a
      // string against the date part of an ISO timestamp.
      const day = r.at.slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      return true
    })
  }, [rows, status, direction, channels, from, to])

  const pager = usePagination(matches, {
    sizes: PAGE_SIZES,
    resetKey: `${status}|${direction}|${channels.join()}|${from}|${to}`,
  })

  const columns = [
    {
      key: 'at',
      header: 'Date',
      width: 116,
      render: (r) => <span className="whitespace-nowrap">{dateTime(r.at)}</span>,
    },
    {
      key: 'who',
      header: 'Who',
      width: 168,
      render: (r) => {
        const { label, icon: Arrow } = moverOf(r.direction)
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold break-words" title={r.who}>
              {r.who}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
              <Arrow size={11} />
              {label}
            </span>
          </div>
        )
      },
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 104,
      render: (r) => {
        const Icon = channelIcon[r.channel] ?? IconChat
        return (
          <Badge tone="muted" size="sm">
            <Icon size={10} />
            {r.channel}
          </Badge>
        )
      },
    },
    {
      key: 'triggeredBy',
      header: 'Triggered by',
      width: 132,
      render: (r) => <span className="break-words">{r.triggeredBy}</span>,
    },
    {
      key: 'summary',
      header: 'Summary',
      width: 196,
      muted: true,
      render: (r) =>
        r.summary ? (
          <span className="break-words">{r.summary}</span>
        ) : (
          <span className="text-ink-4 italic">Scored at close</span>
        ),
    },
    { key: 'ai', header: 'AI status', width: 176, render: (r) => <AiStatus ai={r.ai} /> },
    {
      key: 'ticketStatus',
      header: 'Ticket status',
      width: 108,
      render: (r) => <StatusBadge label={r.ticketStatus} size="sm" />,
    },
    { key: 'artifacts', header: 'Artifacts', width: 96, render: (r) => <ExportMenu row={r} /> },
    {
      key: 'actions',
      header: 'Actions',
      width: 80,
      render: () => (
        <Button
          size="sm"
          className="px-2"
          disabled
          title="Opens the conversation once this log is wired to the API"
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">Conversation log</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            Every conversation with its AI scoring and ticket state
          </p>
        </div>
        <Badge tone="warn" size="sm">
          Mock data
        </Badge>
      </div>

      <Card className="flex flex-col gap-2.5 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ChipGroup label="Filter by ticket status" options={STATUSES} value={status} onChange={setStatus} />
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <ChipGroup
            label="Filter by who moved last"
            options={DIRECTIONS}
            value={direction}
            onChange={setDirection}
          />
          <span aria-hidden="true" className="h-5 w-px bg-line" />
          <ChipGroup
            label="Filter by channel"
            options={CHANNELS}
            value={channels}
            onChange={setChannels}
            multiple
          />
        </div>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </Card>

      <DataTable
        dense={false}
        columns={columns}
        rows={pager.rows}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            icon={IconChat}
            title="No conversations match these filters"
            note="Clear a filter, or widen the date range."
          />
        }
        footer={<TablePager pager={pager} noun="conversations" />}
      />
    </section>
  )
}
