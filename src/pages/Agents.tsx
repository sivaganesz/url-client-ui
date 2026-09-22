import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import StatTile from '../components/ui/StatTile'
import DataTable from '../components/ui/DataTable'
import TablePager from '../components/ui/TablePager'
import Card, { ReservedPanel } from '../components/ui/Card'
import Badge, { StatusBadge } from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import DataBanner from '../components/ui/DataBanner'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { IconAgent, IconAlert, IconGrid, IconPower, IconRows, IconTrend } from '../components/icons'
import { cn } from '../lib/cn'
import { num } from '../lib/format'
import { useResource } from '../lib/useResource'
import { usePagination } from '../lib/usePagination'
import { activateAgent, deactivateAgent, getAgents } from '../lib/api'
import type { Agent, ShellContext, StatusLabel } from '../lib/types'
import type { Column } from '../components/ui/DataTable'

/** The pair of buttons a row shares with its card. */
interface ActAgent {
  pending: string | null
  onAct: (agent: Agent, next: StatusLabel) => void
}

const PAGE_SIZES = [10, 25, 50, 100]

const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/**
 * Switches the list between a dense table and browsable cards.
 *
 * Same agents, same actions — the table is for scanning a dozen of them at
 * once, the cards for reading one.
 */
function ViewToggle({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const options = [
    { id: 'table', label: 'Table', icon: IconRows },
    { id: 'grid', label: 'Grid', icon: IconGrid },
  ]
  return (
    <div
      role="group"
      aria-label="List view"
      className="flex items-center gap-0.5 rounded-lg border border-line-strong bg-sunken p-0.5"
    >
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
            value === id ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink',
          )}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  )
}

/**
 * Activate / Deactivate for one agent.
 *
 * Both buttons are always present so the pair reads the same on every row.
 * The state the agent is already in is disabled rather than hidden, which
 * keeps the column from reflowing as statuses change.
 */
function AgentActions({
  agent,
  pending,
  onAct,
  className,
}: ActAgent & { agent: Agent; className?: string }) {
  const live = agent.status === 'Active'
  const busy = pending === agent.id

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Button
        size="sm"
       
        disabled={busy || live}
        title={(live ? `${agent.name} is already live` : `Publish ${agent.name} and take it live`)}
        onClick={() => onAct(agent, 'Active')}
      >
        {busy && !live ? <Spinner /> : <IconPower size={13} />}
        Activate
      </Button>
      <Button
        size="sm"
        variant="danger"
       
        disabled={busy || !live}
        title={(live ? `Stop ${agent.name} answering customers` : `${agent.name} is not live`)}
        onClick={() => onAct(agent, 'Paused')}
      >
        {busy && live ? <Spinner /> : <IconPower size={13} />}
        Deactivate
      </Button>
    </span>
  )
}

function AgentCard({ agent, ...actions }: ActAgent & { agent: Agent }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <IconAgent size={15} />
          </span>
          <span className="truncate text-[13px] font-semibold" title={agent.name}>
            {agent.name}
          </span>
        </div>
        <StatusBadge label={agent.status} size="sm" />
      </div>

      <p className="line-clamp-2 min-h-[2.6em] text-xs leading-relaxed text-ink-2" title={agent.description}>
        {agent.description}
      </p>

      <div className="flex flex-wrap gap-1">
        {agent.channels.length ? (
          agent.channels.map((c) => (
            <Badge key={c} tone="muted" size="sm">
              {c}
            </Badge>
          ))
        ) : (
          <span className="text-[11px] text-ink-4">No channels connected</span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3 font-mono text-[11px] text-ink-3">
        <span className="truncate" title={agent.model}>
          {agent.model}
        </span>
        <span className="shrink-0">{shortDate(agent.updatedAt)}</span>
      </div>

      <AgentActions agent={agent} {...actions} className="[&>button]:flex-1" />
    </Card>
  )
}

export default function Agents() {
  const { openDrawer } = useOutletContext<ShellContext>()
  const { data: agents, status, error, reload } = useResource(getAgents, [], [])

  const [view, setView] = useState('table')
  /** The agent id whose activate/deactivate is in flight. */
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<{
    name: string
    next: StatusLabel
    message: string
  } | null>(null)
  const [confirming, setConfirming] = useState<{ agent: Agent; next: StatusLabel } | null>(null)

  /**
   * Statuses this session has changed, applied over the loaded list.
   *
   * Only written once the workspace confirms the change, so the list never
   * claims something the API didn't do. A full reload would flash the whole
   * page back to skeletons for a one-word change.
   */
  const [changed, setChanged] = useState<Record<string, StatusLabel>>({})

  const loading = status === 'loading'

  const rows = useMemo(
    () => agents.map((a) => {
      const override = changed[a.id]
      return override ? { ...a, status: override } : a
    }),
    [agents, changed],
  )

  // Counts stay over the whole list — a page is a window on it, not the total.
  const active = rows.filter((a) => a.status === 'Active').length
  const paused = rows.length - active

  const pager = usePagination(rows, { sizes: PAGE_SIZES })
  const visible = pager.rows

  async function apply(agent: Agent, next: StatusLabel) {
    setConfirming(null)
    setFailure(null)
    setPending(agent.id)
    try {
      if (next === 'Active') await activateAgent(agent.id)
      else await deactivateAgent(agent.id)
      setChanged((c) => ({ ...c, [agent.id]: next }))
    } catch (err) {
      setFailure({ name: agent.name, next, message: (err as Error).message })
    } finally {
      setPending(null)
    }
  }

  const actions: ActAgent = {
    pending,
    onAct: (agent, next) => setConfirming({ agent, next }),
  }

  const columns: Column<Agent>[] = [
    {
      key: 'name',
      header: 'Agent',
      width: 200,
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
      width: 160,
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
      width: 300,
      muted: true,
      render: (a) => (
        <span className="block truncate" title={a.description}>
          {a.description}
        </span>
      ),
    },
    { key: 'model', header: 'Build', width: 120, mono: true, muted: true },
    { key: 'updatedAt', header: 'Updated', width: 120, muted: true, render: (a) => shortDate(a.updatedAt) },
    {
      key: 'actions',
      header: 'Action',
      width: 196,
      render: (a) => <AgentActions agent={a} {...actions} />,
    },
  ]

  const grid = (children: React.ReactNode) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
  )

  return (
    <>
      <PageHeader
        title="AI Agents"
        subtitle={loading ? undefined : `${active} active · ${paused} not live`}
        onOpenDrawer={openDrawer}
        actions={<ViewToggle value={view} onChange={setView} />}
      />

      <PageBody className="flex flex-col gap-4">
        <DataBanner status={status} error={error} onRetry={reload} />

        {failure && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger-bg px-4 py-3"
          >
            <IconAlert size={16} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-danger">
                Couldn’t {failure.next === 'Active' ? 'activate' : 'deactivate'} {failure.name}
              </p>
              <p className="mt-0.5 font-mono text-xs leading-relaxed break-words text-ink-2">
                {failure.message}
              </p>
            </div>
            <Button size="sm" className="shrink-0" onClick={() => setFailure(null)}>
              Dismiss
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <StatTile
            label="Total AI agents"
            value={num(rows.length)}
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

        {view === 'table' ? (
          <DataTable
            className="min-h-96 flex-1"
            columns={columns}
            rows={visible}
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
            footer={<TablePager pager={pager} noun="agents" loading={loading} />}
          />
        ) : loading ? (
          grid(
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full rounded-card" />
            )),
          )
        ) : status === 'error' ? (
          <Card>
            <ErrorState error={error} onRetry={reload} />
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={IconAgent}
              title="No agents yet"
              note="This workspace has no agents set up."
            />
          </Card>
        ) : (
          <>
            {grid(visible.map((a) => <AgentCard key={a.id} agent={a} {...actions} />))}
            {/* The table gets its pager from DataTable's footer slot; the grid
                has no such frame, so it carries a matching strip of its own. */}
            <div className="flex h-12 shrink-0 items-center rounded-card border border-line bg-sunken px-4 text-[11.5px] text-ink-3">
              <TablePager pager={pager} noun="agents" />
            </div>
          </>
        )}
      </PageBody>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={confirming?.next === 'Active' ? 'Take this agent live?' : 'Stop this agent?'}
        body={
          confirming?.next === 'Active'
            ? `${confirming?.agent.name} will be published and will start answering customers on ${
                confirming?.agent.channels.join(', ') || 'its connected channels'
              }.`
            : `${confirming?.agent.name} will stop answering customers straight away. Conversations already in progress are not transferred.`
        }
        confirmLabel={confirming?.next === 'Active' ? 'Activate' : 'Deactivate'}
        tone={confirming?.next === 'Active' ? 'primary' : 'danger'}
        onConfirm={() => {
          if (confirming) apply(confirming.agent, confirming.next)
        }}
        onCancel={() => setConfirming(null)}
      />
    </>
  )
}
