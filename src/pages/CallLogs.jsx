import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import DataTable from '../components/ui/DataTable'
import Button from '../components/ui/Button'
import { StatusBadge } from '../components/ui/Badge'
import { SearchInput, Select } from '../components/ui/Field'
import { EmptyState } from '../components/ui/States'
import {
  IconCalendar,
  IconChevronDown,
  IconDownload,
  IconInbound,
  IconOutbound,
  IconPhone,
  IconPlay,
  IconEye,
  IconSearch,
} from '../components/icons'
import DataBanner from '../components/ui/DataBanner'
import { dash, num, pct } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getCalls, UNAVAILABLE } from '../lib/api'
import { calls as sampleCalls, summary } from '../data/sample'

const uniq = (rows, key) => ['All', ...Array.from(new Set(rows.map((r) => r[key]).filter(Boolean)))]

export default function CallLogs() {
  const { openDrawer } = useOutletContext()
  const { data: calls, status, error, reload } = useResource(getCalls, sampleCalls, [])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({
    Direction: 'All',
    Agent: 'All',
    Campaign: 'All',
    Outcome: 'All',
  })

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }))

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return calls.filter((c) => {
      if (filters.Direction !== 'All' && c.direction !== filters.Direction) return false
      if (filters.Agent !== 'All' && c.agent !== filters.Agent) return false
      if (filters.Campaign !== 'All' && c.campaign !== filters.Campaign) return false
      if (filters.Outcome !== 'All' && c.outcome !== filters.Outcome) return false
      if (q === '') return true
      return [c.from, c.to, c.agent, c.campaign].join(' ').toLowerCase().includes(q)
    })
  }, [calls, query, filters])

  const columns = [
    { key: 'startedAt', header: 'Started at', width: 104, mono: true },
    {
      key: 'direction',
      header: 'Direction',
      width: 76,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-ink-2">
          {r.direction === 'Inbound' ? <IconInbound size={12} /> : <IconOutbound size={12} />}
          {r.direction}
        </span>
      ),
    },
    { key: 'from', header: 'From number', width: 104, mono: true },
    { key: 'to', header: 'To number', width: 104, mono: true },
    { key: 'agent', header: 'Agent', width: 92 },
    { key: 'campaign', header: 'Campaign', width: 92, muted: true },
    { key: 'outcome', header: 'Outcome', width: 90, render: (r) => <StatusBadge label={r.outcome} size="sm" /> },
    { key: 'ringingAt', header: 'Ringing at', width: 72, mono: true, muted: true },
    { key: 'answeredAt', header: 'Answered at', width: 76, mono: true, muted: true, render: (r) => dash(r.answeredAt) },
    { key: 'endedAt', header: 'Ended at', width: 70, mono: true, muted: true },
    { key: 'duration', header: 'Duration', width: 64, mono: true, render: (r) => dash(r.duration) },
    { key: 'sentiment', header: 'Sentiment', width: 82, render: (r) => <StatusBadge label={r.sentiment} size="sm" /> },
    {
      key: 'recording',
      header: 'Recording',
      width: 80,
      render: (r) =>
        r.recording ? (
          <Button size="sm" aria-label={`Play recording, ${r.recording}`}>
            <IconPlay size={10} />
            {r.recording}
          </Button>
        ) : (
          <span className="text-ink-4">—</span>
        ),
    },
    {
      key: 'review',
      header: 'Review',
      width: 64,
      // An eye reads as "open this call", so it is a plain action rather than
      // the toggled flag a star implied.
      render: (r) => (
        <Button size="sm" iconOnly aria-label={`Review call from ${r.startedAt}`} className="text-ink-3">
          <IconEye size={14} />
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Call Log Analytics"
        subtitle={`${num(summary.totalCalls)} calls`}
        onOpenDrawer={openDrawer}
        actions={
          <>
            <Button className="hidden sm:inline-flex">
              <IconCalendar size={15} />
              Last 30 days
              <IconChevronDown size={13} />
            </Button>
            <Button iconOnly aria-label="Export call log">
              <IconDownload size={15} />
            </Button>
          </>
        }
      />

      <PageBody className="flex flex-col gap-4">
        <DataBanner
          status={status}
          error={error}
          onRetry={reload}
          note={UNAVAILABLE.calls}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile label="Total calls" value={num(summary.totalCalls)} foot="Last 30 days" icon={IconPhone} />
          <StatTile
            label="Inbound calls"
            value={num(summary.inboundCalls)}
            foot={`${pct(summary.inboundCalls / summary.totalCalls)} of total`}
            icon={IconInbound}
          />
          <StatTile
            label="Outbound calls"
            value={num(summary.outboundCalls)}
            foot={`${pct(summary.outboundCalls / summary.totalCalls)} of total`}
            icon={IconOutbound}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput
            label="Search calls by number, agent or campaign"
            placeholder="Search number, agent, campaign"
            value={query}
            onChange={setQuery}
            className="w-full sm:w-72"
          />
          <Select label="Direction" value={filters.Direction} onChange={setFilter('Direction')} options={uniq(calls, 'direction')} />
          <Select label="Agent" value={filters.Agent} onChange={setFilter('Agent')} options={uniq(calls, 'agent')} />
          <Select label="Campaign" value={filters.Campaign} onChange={setFilter('Campaign')} options={uniq(calls, 'campaign')} />
          <Select label="Outcome" value={filters.Outcome} onChange={setFilter('Outcome')} options={uniq(calls, 'outcome')} />
          <div className="flex-1" />
          <Button className="hidden lg:inline-flex">
            <IconDownload size={14} />
            Export
          </Button>
        </div>

        <DataTable
          className="min-h-96 flex-1"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.startedAt}
          empty={
            <EmptyState
              icon={IconSearch}
              title="No calls match these filters"
              note="Try a different search term, or reset the dropdowns to All."
            />
          }
          footer={
            <>
              <span>
                Showing {rows.length} of {num(summary.totalCalls)} calls
              </span>
              <span className="flex gap-1.5">
                <Button size="sm" disabled>
                  Previous
                </Button>
                <Button size="sm">Next</Button>
              </span>
            </>
          }
        />
      </PageBody>
    </>
  )
}
