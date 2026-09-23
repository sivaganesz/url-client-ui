import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import DataTable, { type Column } from '../../components/ui/DataTable'
import TablePager from '../../components/ui/TablePager'
import Spinner from '../../components/ui/Spinner'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { IconAgent, IconAlert, IconCheck } from '../../components/icons'
import { cn } from '../../lib/cn'
import { usePagination } from '../../lib/usePagination'
import { useResource } from '../../lib/useResource'
import { adminApi, type CustomerRow } from '../../lib/admin'
import EditConnectionDialog from './EditConnectionDialog'

/**
 * Every customer, and the button that makes another.
 *
 * The columns are flags, not values: whether a workspace has its Perfox key,
 * not what the key is. Nothing on this page can read a credential back,
 * because the endpoint behind it does not return one.
 */
export default function Customers() {
  const load = useCallback(async () => (await adminApi.customers()).customers, [])
  const { data: customers, status, error, reload } = useResource<CustomerRow[]>(load, [], [])

  const [editing, setEditing] = useState<CustomerRow | null>(null)
  // Same sizes on all three admin lists, so the footer behaves identically
  // wherever an admin happens to be.
  const pager = usePagination(customers, { sizes: [25, 50, 100] })
  const [busy, setBusy] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  /** Per workspace, so the result sits next to the row it is about. */
  const [tested, setTested] = useState<Record<string, { ok: boolean; reason: string }>>({})

  /**
   * Does this connection work?
   *
   * Without it an admin types a key and finds out it was wrong when the
   * customer complains.
   */
  async function test(row: CustomerRow) {
    // Both actions key off the workspace now, so the busy marker says which
    // one is running rather than spinning on every button in the row.
    setBusy(`test:${row.workspace_id}`)
    setFailure(null)
    try {
      const result = await adminApi.testConnection(row.workspace_id)
      setTested((t) => ({ ...t, [row.workspace_id]: result }))
    } catch (err) {
      setFailure((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function setStatus(row: CustomerRow, next: 'active' | 'suspended') {
    // Keyed by the workspace: suspending a customer has to reach everyone in
    // it, not only whoever happens to be its owner.
    setBusy(`status:${row.workspace_id}`)
    setFailure(null)
    try {
      await adminApi.setStatus(row.workspace_id, next)
      reload()
    } catch (err) {
      setFailure((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const columns: Column<CustomerRow>[] = [
    {
      key: 'workspace_name',
      header: 'Workspace',
      width: 190,
      render: (r) => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
            <IconAgent size={13} />
          </span>
          <span className="truncate font-medium" title={r.workspace_name}>
            {r.workspace_name}
          </span>
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Contact',
      width: 220,
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{r.user_name ?? '—'}</span>
          <span className="truncate text-[11px] text-ink-3">{r.email ?? 'no owner'}</span>
        </span>
      ),
    },
    {
      key: 'connection',
      header: 'Perfox',
      width: 190,
      render: (r) => {
        const result = tested[r.workspace_id]
        return (
          <span className="flex flex-col gap-1">
            <span className="flex flex-wrap gap-1">
              {/* Flags, never the key. No endpoint would return it. */}
              <Badge tone={r.has_api_token ? 'ok' : 'muted'} size="sm">
                {r.has_api_token ? <IconCheck size={10} /> : null}
                {r.has_api_token ? 'Connected' : 'No key'}
              </Badge>
              {r.has_operator && (
                <Badge tone="info" size="sm">
                  Calling
                </Badge>
              )}
            </span>
            {result && (
              <span
                className={cn(
                  'text-[10.5px] leading-snug',
                  result.ok ? 'text-ok' : 'text-danger',
                )}
              >
                {result.reason}
              </span>
            )}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: 100,
      render: (r) => <StatusBadge label={r.status === 'suspended' ? 'Paused' : 'Active'} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Action',
      width: 230,
      render: (r) => {
        const suspended = r.status === 'suspended'
        const working = busy === `test:${r.workspace_id}` || busy === `status:${r.workspace_id}`
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" disabled={working} onClick={() => void test(r)}>
              {busy === `test:${r.workspace_id}` ? <Spinner size={11} /> : null}
              Test
            </Button>
            <Button size="sm" disabled={working} onClick={() => setEditing(r)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant={suspended ? 'secondary' : 'danger'}
              disabled={working}
              onClick={() => void setStatus(r, suspended ? 'active' : 'suspended')}
            >
              {busy === `status:${r.workspace_id}` ? <Spinner size={11} /> : null}
              {suspended ? 'Reinstate' : 'Suspend'}
            </Button>
          </span>
        )
      },
    },
  ]

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-[12.5px] text-ink-3">
            {status === 'ready'
              ? `${customers.length} ${customers.length === 1 ? 'workspace' : 'workspaces'}`
              : 'Loading…'}
          </p>
        </div>
        {/* A page, not a dialog: fifteen fields across three groups, and a
            result worth staying on screen. */}
        <Link to="/admin/customers/new">
          <Button variant="primary" size="md">Add customer</Button>
        </Link>
      </div>

      {failure && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger-bg px-3.5 py-3"
        >
          <IconAlert size={15} className="mt-0.5 shrink-0 text-danger" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-2">{failure}</p>
        </div>
      )}

      {status === 'error' ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={pager.rows}
          footer={<TablePager pager={pager} noun="customers" loading={status === 'loading'} />}
          rowKey={(r) => r.workspace_id}
          empty={
            <EmptyState
              icon={IconAgent}
              title="No customers yet"
              note="Add one, and hand over the email and password you set."
            />
          }
        />
      )}

      {editing && (
        <EditConnectionDialog
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
    </section>
  )
}
