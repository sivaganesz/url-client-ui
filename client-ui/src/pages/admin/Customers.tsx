import { useCallback, useState } from 'react'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import DataTable, { type Column } from '../../components/ui/DataTable'
import Spinner from '../../components/ui/Spinner'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { IconAgent, IconAlert, IconCheck } from '../../components/icons'
import { cn } from '../../lib/cn'
import { useResource } from '../../lib/useResource'
import { adminApi, type CustomerRow } from '../../lib/admin'
import NewCustomerDialog from './NewCustomerDialog'

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

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<CustomerRow | null>(null)
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
    setBusy(row.workspace_id)
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
    if (!row.user_id) return
    setBusy(row.user_id)
    setFailure(null)
    try {
      await adminApi.setStatus(row.user_id, next)
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
        const working = busy === r.workspace_id || busy === r.user_id
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" disabled={working} onClick={() => void test(r)}>
              {busy === r.workspace_id ? <Spinner size={11} /> : null}
              Test
            </Button>
            <Button size="sm" disabled={working} onClick={() => setEditing(r)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant={suspended ? 'secondary' : 'danger'}
              disabled={!r.user_id || working}
              onClick={() => void setStatus(r, suspended ? 'active' : 'suspended')}
            >
              {busy === r.user_id ? <Spinner size={11} /> : null}
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
        <Button variant="primary" size="md" onClick={() => setCreating(true)}>
          Add customer
        </Button>
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
          rows={customers}
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

      {(creating || editing) && (
        <NewCustomerDialog
          editing={editing ?? undefined}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            reload()
          }}
        />
      )}
    </section>
  )
}
