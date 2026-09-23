import { useCallback } from 'react'
import DataTable, { type Column } from '../../components/ui/DataTable'
import TablePager from '../../components/ui/TablePager'
import Badge from '../../components/ui/Badge'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { IconClock } from '../../components/icons'
import { usePagination } from '../../lib/usePagination'
import { useResource } from '../../lib/useResource'
import { adminApi, type AdminEvent } from '../../lib/admin'

/**
 * What each action is called, in words rather than in the identifiers the
 * table stores. An unknown one falls back to its own name — a trail that hides
 * an action it does not recognise is worse than one that prints it raw.
 */
const ACTIONS: Record<string, { label: string; tone: 'ok' | 'danger' | 'info' | 'muted' }> = {
  'customer.create': { label: 'Created customer', tone: 'ok' },
  'customer.update': { label: 'Changed connection', tone: 'info' },
  'customer.suspend': { label: 'Suspended customer', tone: 'danger' },
  'customer.reinstate': { label: 'Reinstated customer', tone: 'ok' },
  'admin.create': { label: 'Added administrator', tone: 'ok' },
  'admin.suspend': { label: 'Suspended administrator', tone: 'danger' },
  'admin.reinstate': { label: 'Reinstated administrator', tone: 'ok' },
  'admin.password': { label: 'Changed own password', tone: 'muted' },
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/** The fields that changed, for a connection edit. Never their values. */
function detailOf(event: AdminEvent): string {
  const fields = event.detail?.fields
  if (Array.isArray(fields) && fields.length > 0) {
    return fields
      .map((f) => String(f).replace(/_enc$/, '').replaceAll('_', ' '))
      .join(', ')
  }
  if (typeof event.detail?.email === 'string') return event.detail.email
  return ''
}

/**
 * Everything done on this surface, newest first.
 *
 * Every action here either creates or takes away somebody's access, or changes
 * a credential that reaches a customer's data, and none of it used to leave a
 * trace — "who suspended Northwind, and when?" had no answer.
 *
 * Any admin can read it, deliberately: a record only one person can see is a
 * record that person can quietly be wrong about. Nothing can edit or delete an
 * entry, for the same reason, and no value of any credential is in here — only
 * which field was touched.
 */
export default function Activity() {
  const load = useCallback(async () => (await adminApi.events()).events, [])
  const { data: events, status, error, reload } = useResource<AdminEvent[]>(load, [], [])
  const pager = usePagination(events, { sizes: [25, 50, 100] })

  const columns: Column<AdminEvent>[] = [
    {
      key: 'created_at',
      header: 'When',
      width: 160,
      render: (e) => <span className="whitespace-nowrap">{stamp(e.created_at)}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      width: 190,
      render: (e) => {
        const known = ACTIONS[e.action]
        return (
          <Badge tone={known?.tone ?? 'muted'} size="sm">
            {known?.label ?? e.action}
          </Badge>
        )
      },
    },
    {
      key: 'target',
      header: 'Subject',
      width: 200,
      render: (e) => (
        <span className="truncate" title={e.target_id ?? undefined}>
          {e.target_label ?? (e.target_id ? `${e.target_type} ${e.target_id.slice(0, 8)}` : '—')}
        </span>
      ),
    },
    {
      key: 'detail',
      header: 'Detail',
      width: 220,
      muted: true,
      render: (e) => <span className="truncate">{detailOf(e) || '—'}</span>,
    },
    {
      key: 'admin_email',
      header: 'By',
      width: 190,
      // The address as it was, so a suspended or renamed admin still reads.
      render: (e) => <span className="truncate">{e.admin_email}</span>,
    },
  ]

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-[17px] font-semibold tracking-tight">Activity</h1>
        <p className="mt-1 text-[12.5px] text-ink-3">
          {status === 'ready'
            ? `${events.length} ${events.length === 1 ? 'entry' : 'entries'}, newest first`
            : 'Loading…'}
        </p>
      </div>

      {status === 'error' ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={pager.rows}
          footer={<TablePager pager={pager} noun="entries" loading={status === 'loading'} />}
          rowKey={(e) => e.id}
          empty={
            <EmptyState
              icon={IconClock}
              title="Nothing recorded yet"
              note="Creating a customer, changing a connection or suspending an account appears here."
            />
          }
        />
      )}
    </section>
  )
}
