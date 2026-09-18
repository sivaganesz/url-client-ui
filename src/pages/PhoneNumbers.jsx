import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import DataTable from '../components/ui/DataTable'
import Button from '../components/ui/Button'
import Badge, { StatusBadge } from '../components/ui/Badge'
import { ReservedPanel } from '../components/ui/Card'
import { SearchInput, Select } from '../components/ui/Field'
import { EmptyState } from '../components/ui/States'
import { IconHash, IconMore, IconPlus, IconSearch, IconTrend } from '../components/icons'
import DataBanner from '../components/ui/DataBanner'
import { num } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getPhoneNumbers, UNAVAILABLE } from '../lib/api'
import { phoneNumbers as samplePhoneNumbers, summary } from '../data/sample'

const uniq = (rows, key) => ['All', ...Array.from(new Set(rows.map((r) => r[key]).filter(Boolean)))]

export default function PhoneNumbers() {
  const { openDrawer } = useOutletContext()
  const { data: phoneNumbers, status, error, reload } = useResource(getPhoneNumbers, samplePhoneNumbers, [])
  const [query, setQuery] = useState('')
  const [agent, setAgent] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return phoneNumbers.filter((n) => {
      if (agent !== 'All' && n.agent !== agent) return false
      if (statusFilter !== 'All' && n.status !== statusFilter) return false
      if (q === '') return true
      return `${n.number} ${n.label}`.toLowerCase().includes(q)
    })
  }, [phoneNumbers, query, agent, statusFilter])

  const columns = [
    { key: 'number', header: 'Number', width: 152, mono: true, className: 'text-[12px]' },
    { key: 'label', header: 'Label', width: 156, className: 'text-[12px]' },
    { key: 'type', header: 'Type', width: 104, muted: true, className: 'text-[12px]' },
    { key: 'provider', header: 'Provider', width: 112, muted: true, className: 'text-[12px]' },
    {
      key: 'agent',
      header: 'Linked agent',
      width: 152,
      render: (r) =>
        r.agent ? <Badge tone="info">{r.agent}</Badge> : <Badge tone="muted">Not linked</Badge>,
    },
    { key: 'direction', header: 'Direction', width: 116, muted: true, className: 'text-[12px]' },
    {
      key: 'conversations',
      header: 'Conversations',
      width: 120,
      mono: true,
      className: 'text-[12px]',
      render: (r) => num(r.conversations),
    },
    { key: 'status', header: 'Status', width: 100, render: (r) => <StatusBadge label={r.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      width: 112,
      render: () => (
        <span className="flex gap-1.5">
          <Button size="sm">Edit</Button>
          <Button size="sm" iconOnly aria-label="More actions">
            <IconMore size={13} />
          </Button>
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Phone Number Connections"
        subtitle={`${summary.liveNumbers} connected · ${summary.pendingNumbers} pending`}
        onOpenDrawer={openDrawer}
        actions={
          <Button variant="primary">
            <IconPlus size={14} />
            Connect number
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-4">
        <DataBanner
          status={status}
          error={error}
          onRetry={reload}
          note={UNAVAILABLE.phoneNumbers}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <StatTile
            label="Total connections"
            value={num(summary.totalNumbers)}
            foot={`${summary.liveNumbers} live · ${summary.pendingNumbers} pending verification`}
            icon={IconHash}
          />
          <ReservedPanel
            icon={IconTrend}
            title="Further number metrics"
            note="Reserved — only the connection total is specified so far."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput
            label="Search phone numbers"
            placeholder="Search number or label"
            value={query}
            onChange={setQuery}
            className="w-full sm:w-72"
          />
          <Select label="Agent" value={agent} onChange={setAgent} options={uniq(phoneNumbers, 'agent')} />
          <Select label="Status" value={statusFilter} onChange={setStatusFilter} options={uniq(phoneNumbers, 'status')} />
        </div>

        <DataTable
          className="min-h-96 flex-1"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.number}
          empty={
            <EmptyState
              icon={IconSearch}
              title="No numbers match"
              note="Try a different search term, or reset the dropdowns to All."
            />
          }
        />
      </PageBody>
    </>
  )
}
