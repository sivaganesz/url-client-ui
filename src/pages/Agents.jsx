import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import DataTable from '../components/ui/DataTable'
import { ReservedPanel } from '../components/ui/Card'
import Badge, { StatusBadge } from '../components/ui/Badge'
import DataBanner from '../components/ui/DataBanner'
import { EmptyState } from '../components/ui/States'
import { IconAgent, IconTrend } from '../components/icons'
import { num } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getAgents } from '../lib/api'
import { agents as sampleAgents } from '../data/sample'

const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function Agents() {
  const { openDrawer } = useOutletContext()
  const { data: agents, status, error, reload } = useResource(getAgents, sampleAgents, [])

  const loading = status === 'loading'
  const active = agents.filter((a) => a.status === 'Active').length
  const paused = agents.length - active

  const columns = [
    {
      key: 'name',
      header: 'Agent',
      width: 220,
      render: (a) => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
            <IconAgent size={13} />
          </span>
          <span className="truncate font-medium" title={a.name}>
            {a.name}
          </span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', width: 96, render: (a) => <StatusBadge label={a.status} size="sm" /> },
    {
      key: 'channels',
      header: 'Channels',
      width: 170,
      render: (a) =>
        a.channels.length ? (
          <span className="flex gap-1">
            {a.channels.map((c) => (
              <Badge key={c} tone="muted" size="sm">
                {c}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-ink-4">—</span>
        ),
    },
    {
      key: 'description',
      header: 'Description',
      width: 340,
      muted: true,
      render: (a) => (
        <span className="block truncate" title={a.description}>
          {a.description}
        </span>
      ),
    },
    { key: 'model', header: 'Build', width: 120, mono: true, muted: true },
    { key: 'updatedAt', header: 'Updated', width: 130, muted: true, render: (a) => shortDate(a.updatedAt) },
  ]

  return (
    <>
      <PageHeader
        title="AI Agents"
        subtitle={loading ? undefined : `${active} active · ${paused} not live`}
        onOpenDrawer={openDrawer}
      />

      <PageBody className="flex flex-col gap-4">
        <DataBanner status={status} error={error} onRetry={reload} note="Showing bundled samples." />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <StatTile
            label="Total AI agents"
            value={num(agents.length)}
            foot={`${active} published · ${paused} not live`}
            icon={IconAgent}
            loading={loading}
          />
          <ReservedPanel
            icon={IconTrend}
            title="Further agent metrics"
            note="Reserved — the agents endpoint returns no per-agent conversation or resolution figures, so only the count is real."
          />
        </div>

        <DataTable
          className="min-h-96 flex-1"
          columns={columns}
          rows={agents}
          rowKey={(a) => a.id}
          loading={loading}
          error={status === 'error' ? error : null}
          onRetry={reload}
          empty={
            <EmptyState
              icon={IconAgent}
              title="No agents yet"
              note="This workspace has no agents set up."
            />
          }
          footer={<span>{agents.length} agents</span>}
        />
      </PageBody>
    </>
  )
}
