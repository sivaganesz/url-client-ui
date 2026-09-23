import { useCallback, useState } from 'react'
import Button from '../../components/ui/Button'
import DataTable, { type Column } from '../../components/ui/DataTable'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { StatusBadge } from '../../components/ui/Badge'
import { FormField, controlClass } from '../../components/ui/Field'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { IconAgent, IconAlert } from '../../components/icons'
import { cn } from '../../lib/cn'
import { useResource } from '../../lib/useResource'
import { adminApi, useAdmin, type AdminRow } from '../../lib/admin'

/** The backend's floor, repeated so the form can say it before submitting. */
const MIN_LENGTH = 12

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/**
 * Who else can sign in at /admin/login.
 *
 * More than one admin has been allowed since the first migration, on the
 * grounds that a single shared login is how credentials end up being passed
 * around in chat. But making a second one meant running `seed:admin` on the
 * server, and there was nowhere to see who already had access — an account
 * nobody can enumerate is not more secure, only harder to take away.
 */
export default function Admins() {
  const { admin: me } = useAdmin()
  const load = useCallback(async () => (await adminApi.admins()).admins, [])
  const { data: admins, status, error, reload } = useResource<AdminRow[]>(load, [], [])

  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const active = admins.filter((a) => a.status === 'active').length

  async function setStatus(row: AdminRow, next: 'active' | 'suspended') {
    setBusy(row.id)
    setFailure(null)
    try {
      await adminApi.setAdminStatus(row.id, next)
      reload()
    } catch (err) {
      setFailure((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const columns: Column<AdminRow>[] = [
    {
      key: 'name',
      header: 'Name',
      width: 200,
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{r.name}</span>
          <span className="truncate text-[11px] text-ink-3">{r.email}</span>
        </span>
      ),
    },
    { key: 'created_at', header: 'Added', width: 120, render: (r) => when(r.created_at) },
    {
      key: 'last_seen',
      header: 'Last signed in',
      width: 130,
      // Never is worth seeing: an account handed out and never used is one
      // that can be taken back without asking anybody.
      render: (r) => (r.last_seen ? when(r.last_seen) : <span className="text-ink-4">Never</span>),
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
      width: 130,
      render: (r) => {
        const isMe = r.id === me?.id
        const suspended = r.status === 'suspended'
        // The two the server refuses as well, said here rather than after a
        // round trip: locking out the last way in needs a person with psql.
        const last = !suspended && active <= 1
        const why = isMe ? 'This is you.' : last ? 'The last active administrator.' : undefined

        return (
          <Button
            size="sm"
            variant={suspended ? 'secondary' : 'danger'}
            title={why}
            disabled={isMe || last || busy === r.id}
            onClick={() => void setStatus(r, suspended ? 'active' : 'suspended')}
          >
            {busy === r.id ? <Spinner size={11} /> : null}
            {suspended ? 'Reinstate' : 'Suspend'}
          </Button>
        )
      },
    },
  ]

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight">Administrators</h1>
          <p className="mt-1 text-[12.5px] text-ink-3">
            {status === 'ready'
              ? `${admins.length} ${admins.length === 1 ? 'account' : 'accounts'}, ${active} active`
              : 'Loading…'}
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setAdding(true)}>
          Add administrator
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
          rows={admins}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={IconAgent} title="No administrators" />}
        />
      )}

      {adding && (
        <NewAdminDialog
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            reload()
          }}
        />
      )}
    </section>
  )
}

function NewAdminDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = f.password !== '' && f.password.length < MIN_LENGTH
  const ready = f.name.trim() !== '' && f.email.trim() !== '' && f.password.length >= MIN_LENGTH && !busy

  async function submit() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await adminApi.addAdmin({ name: f.name.trim(), email: f.email.trim(), password: f.password })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof typeof f, label: string, type: string, hint?: string) => (
    <FormField label={label} hint={hint} hintTone={hint ? 'warn' : 'muted'}>
      {(id) => (
        <input
          id={id}
          type={type}
          value={f[key]}
          // Off throughout: this is somebody else's account, and a browser
          // offering to remember it is the wrong thing to have happen.
          autoComplete="off"
          onChange={(e) => setF((prev) => ({ ...prev, [key]: e.target.value }))}
          className={cn(controlClass, 'h-10')}
        />
      )}
    </FormField>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title="Add an administrator"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="md" disabled={!ready} onClick={submit}>
            {busy ? <Spinner size={12} /> : null}
            {busy ? 'Adding…' : 'Add administrator'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger-bg px-3.5 py-3"
          >
            <IconAlert size={15} className="mt-0.5 shrink-0 text-danger" />
            <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-2">{error}</p>
          </div>
        )}

        <p className="text-[12.5px] leading-relaxed text-ink-3">
          They can do everything you can, including adding more administrators. Give them the
          password yourself — it is not shown again, and they can change it once they are in.
        </p>

        {field('name', 'Name', 'text')}
        {field('email', 'Email', 'email')}
        {field(
          'password',
          'Password',
          'password',
          tooShort ? `Use at least ${MIN_LENGTH} characters.` : undefined,
        )}
      </div>
    </Modal>
  )
}
