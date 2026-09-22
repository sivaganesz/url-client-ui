import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import DataTable from '../components/ui/DataTable'
import TablePager from '../components/ui/TablePager'
import Badge, { StatusBadge } from '../components/ui/Badge'
import DataBanner from '../components/ui/DataBanner'
import { SearchInput, Select } from '../components/ui/Field'
import { EmptyState } from '../components/ui/States'
import { IconCheck, IconClock, IconEye, IconPause, IconPhone, IconPlay, IconSearch } from '../components/icons'
import { cn } from '../lib/cn'
import { num, pct } from '../lib/format'
import { useResource } from '../lib/useResource'
import { usePagination } from '../lib/usePagination'
import { getCalls, spoken } from '../lib/api'
import { useCallAudio } from '../components/useCallAudio'

const ALL = 'All'
const uniq = (rows, key) => [ALL, ...new Set(rows.map((r) => r[key]).filter(Boolean))]

const PAGE_SIZES = [25, 50, 100]

/** Player clock: 147 -> "2:27". Padded so the width doesn't jitter per tick. */
const mmss = (seconds) => {
  const t = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

const stamp = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

export default function CallLogs() {
  const { openDrawer } = useOutletContext()
  const { data: calls, status, error, reload } = useResource(getCalls, [], [])

  const [query, setQuery] = useState('')
  const [channel, setChannel] = useState(ALL)
  const [outcome, setOutcome] = useState(ALL)
  const [recorded, setRecorded] = useState(ALL)
  const audio = useCallAudio()

  const loading = status === 'loading'

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return calls.filter((c) => {
      if (channel !== ALL && c.channel !== channel) return false
      if (outcome !== ALL && c.status !== outcome) return false
      if (recorded === 'Recorded' && !c.hasRecording) return false
      if (recorded === 'Not recorded' && c.hasRecording) return false
      if (!q) return true
      return [c.name, c.phone, c.summary].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [calls, query, channel, outcome, recorded])

  const pager = usePagination(matches, {
    sizes: PAGE_SIZES,
    resetKey: `${query}|${channel}|${outcome}|${recorded}`,
    onLeavePage: audio.stop,
  })
  const rows = pager.rows

  const withRecording = calls.filter((c) => c.hasRecording).length
  const resolved = calls.filter((c) => c.status === 'Resolved').length
  const timed = calls.filter((c) => c.durationSeconds !== null)
  const totalTalk = timed.reduce((sum, c) => sum + c.durationSeconds, 0)

  const columns = [
    { key: 'startedAt', header: 'Started at', width: 116, mono: true, render: (c) => stamp(c.startedAt) },
    {
      key: 'name',
      header: 'Customer',
      width: 150,
      render: (c) => c.name ?? <span className="text-ink-4">Unknown</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      width: 128,
      mono: true,
      render: (c) => c.phone ?? <span className="text-ink-4">—</span>,
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 104,
      render: (c) => (
        <Badge tone="muted" size="sm">
          {c.channel}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Outcome',
      width: 104,
      render: (c) => <StatusBadge label={c.status} size="sm" />,
    },
    {
      key: 'durationSeconds',
      header: 'Duration',
      width: 84,
      mono: true,
      render: (c) => spoken(c.durationSeconds) ?? <span className="text-ink-4">—</span>,
    },
    {
      key: 'summary',
      header: 'What happened',
      width: 340,
      muted: true,
      render: (c) =>
        c.summary ? (
          <span className="block truncate" title={c.summary}>
            {c.summary}
          </span>
        ) : (
          <span className="text-ink-4">No summary</span>
        ),
    },
    {
      key: 'recording',
      header: 'Recording',
      width: 82,
      render: (c) => {
        if (!c.hasRecording) return <span className="text-ink-4">—</span>
        const mine = audio.id === c.id
        const failed = mine && audio.status === 'error'
        const playing = mine && audio.status === 'playing'
        const live = mine && (playing || audio.status === 'paused')
        const busy = mine && audio.status === 'loading'
        return (
          <button
            type="button"
            onClick={() => audio.toggle(c.id)}
            aria-label={playing ? 'Pause recording' : 'Play the full call'}
            title={failed ? audio.error?.message : playing ? 'Pause' : 'Play the full call'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-1 py-0.5 -ml-1 transition-colors',
              'font-mono text-[11.5px] tabular-nums',
              failed
                ? 'text-danger'
                : live || busy
                  ? 'text-brand'
                  : 'text-ink-2 hover:text-brand',
            )}
          >
            {busy ? (
              <span
                aria-hidden="true"
                className="h-[11px] w-[11px] shrink-0 animate-spin rounded-full border border-current border-t-transparent"
              />
            ) : playing ? (
              <IconPause size={11} />
            ) : (
              <IconPlay size={11} />
            )}
            {live
              ? mmss(audio.at)
              : failed
                ? 'Retry'
                : mmss(c.durationSeconds ?? 0)}
          </button>
        )
      },
    },
    {
      key: 'open',
      header: 'Review',
      width: 72,
      render: (c) => (
        <Link
          to={`/conversations/${c.id}`}
          aria-label={`Open the conversation for this call`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line-strong text-ink-3 transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand"
        >
          <IconEye size={14} />
        </Link>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Call Log Analytics"
        subtitle={loading ? undefined : `${num(calls.length)} calls`}
        onOpenDrawer={openDrawer}
      />

      <PageBody className="flex flex-col gap-4">
        <DataBanner status={status} error={error} onRetry={reload} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Total calls"
            value={num(calls.length)}
            foot="Phone and web voice"
            icon={IconPhone}
            loading={loading}
          />
          <StatTile
            label="Resolved"
            value={num(resolved)}
            foot={calls.length ? `${pct(resolved / calls.length)} of all calls` : undefined}
            icon={IconCheck}
            loading={loading}
          />
          <StatTile
            label="Recordings available"
            value={num(withRecording)}
            foot="Older audio ages out of retention"
            icon={IconPlay}
            loading={loading}
          />
          <StatTile
            label="Total talk time"
            value={spoken(totalTalk) ?? '—'}
            foot={timed.length ? `across ${num(timed.length)} timed calls` : undefined}
            icon={IconClock}
            loading={loading}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput
            label="Search calls by customer, number or summary"
            placeholder="Search name, number or summary"
            value={query}
            onChange={setQuery}
            className="w-full sm:w-72"
          />
          <Select label="Channel" value={channel} onChange={setChannel} options={uniq(calls, 'channel')} />
          <Select label="Outcome" value={outcome} onChange={setOutcome} options={uniq(calls, 'status')} />
          <Select
            label="Recording"
            value={recorded}
            onChange={setRecorded}
            options={[ALL, 'Recorded', 'Not recorded']}
          />
        </div>

        <DataTable
          className="min-h-96 flex-1"
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          loading={loading}
          error={status === 'error' ? error : null}
          onRetry={reload}
          empty={
            <EmptyState
              icon={IconSearch}
              title={calls.length ? 'No calls match these filters' : 'No calls yet'}
              note={
                calls.length
                  ? 'Try a different search, or reset the dropdowns to All.'
                  : 'Calls appear here once customers reach you by phone or web voice.'
              }
            />
          }
          footer={<TablePager pager={pager} noun="calls" loading={loading} />}
        />
      </PageBody>
    </>
  )
}
