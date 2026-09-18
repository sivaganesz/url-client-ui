import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import Card, { ReservedPanel } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge, { StatusBadge } from '../components/ui/Badge'
import DataBanner from '../components/ui/DataBanner'
import { EmptyState, Skeleton } from '../components/ui/States'
import { IconAgent, IconPlus, IconTrend } from '../components/icons'
import { num } from '../lib/format'
import { useResource } from '../lib/useResource'
import { getAgents } from '../lib/api'
import { agents as sampleAgents } from '../data/sample'

export default function Agents() {
  const { openDrawer } = useOutletContext()
  const { data: agents, status, error, reload } = useResource(getAgents, sampleAgents, [])

  const loading = status === 'loading'
  const active = agents.filter((a) => a.status === 'Active').length
  const paused = agents.length - active

  return (
    <>
      <PageHeader
        title="AI Agents"
        subtitle={loading ? undefined : `${active} active · ${paused} paused`}
        onOpenDrawer={openDrawer}
        actions={
          <Button variant="primary">
            <IconPlus size={14} />
            New agent
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-5">
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
            note="Reserved — list_agents returns no per-agent conversation or resolution figures, so only the count is real."
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="flex flex-col gap-3.5 p-5">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="mt-2 h-9 w-full" />
              </Card>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card>
            <EmptyState
              icon={IconAgent}
              title="No agents yet"
              note="This workspace has no agents. Create one to start handling conversations."
              action={
                <Button variant="primary">
                  <IconPlus size={14} />
                  New agent
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((a) => (
              <Card key={a.id} className="flex flex-col gap-3.5 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <IconAgent size={18} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold" title={a.name}>
                      {a.name}
                    </span>
                    <span className="truncate font-mono text-[11px] text-ink-3">{a.model}</span>
                  </div>
                  <StatusBadge label={a.status} />
                </div>

                <p className="line-clamp-2 text-xs leading-relaxed text-ink-2">{a.description}</p>

                <div className="flex flex-wrap gap-1.5">
                  {a.channels.length > 0 ? (
                    a.channels.map((c) => (
                      <Badge key={c} tone="muted" size="sm">
                        {c}
                      </Badge>
                    ))
                  ) : (
                    <Badge tone="muted" size="sm">
                      No channel
                    </Badge>
                  )}
                </div>

                <div className="flex-1" />

                <div className="flex gap-2 border-t border-line pt-3.5">
                  <Button className="flex-1 justify-center">Configure</Button>
                  <Button className="flex-1 justify-center">View logs</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageBody>
    </>
  )
}
