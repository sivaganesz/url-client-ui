import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { FormField, controlClass } from '../../components/ui/Field'
import { IconAlert } from '../../components/icons'
import { cn } from '../../lib/cn'
import { adminApi, type CustomerRow, type NewCustomer } from '../../lib/admin'

/**
 * Changing an existing workspace's connection.
 *
 * Creating a customer moved to a page of its own — fifteen fields across three
 * groups, and a result worth staying on screen. This stayed a dialog because
 * it is the opposite shape: a handful of fields, opened from a row, answering
 * one question about that row.
 *
 * It is also the one place in the product where a raw Perfox key is typed,
 * which is unavoidable — somebody has to enter it — so the handling is
 * deliberate. The secrets are password fields with autocomplete off, they are
 * never read back from the server, and the only way to change one is to type
 * it again. Nothing here can display an existing credential, because no
 * endpoint returns one.
 */
export default function EditConnectionDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: CustomerRow
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState<Partial<NewCustomer>>({
    workspaceName: editing.workspace_name,
    perfoxApiBase: editing.perfox_api_base ?? '',
    perfoxApiToken: '',
    operatorApiHost: '',
    operatorSiteId: '',
    operatorSiteSecret: '',
    operatorWorkflowId: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = (f.workspaceName ?? '').trim() !== '' && !busy

  async function submit() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      // Only the connection. The user's name, email and password are theirs to
      // change, not an admin's to overwrite.
      await adminApi.updateCustomer(editing.workspace_id, f)
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const field = (
    key: keyof NewCustomer,
    label: string,
    opts: { placeholder?: string; hint?: string; secret?: boolean } = {},
  ) => (
    <FormField label={label} hint={opts.hint}>
      {(id) => (
        <input
          id={id}
          type={opts.secret ? 'password' : 'text'}
          value={f[key] ?? ''}
          placeholder={opts.placeholder}
          // Off for every field here: none of this is the admin's own detail,
          // and a browser offering to remember a customer's API key is exactly
          // the wrong thing to have happen.
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
      title="Change the connection"
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="md" disabled={!ready} onClick={submit}>
            {busy ? <Spinner size={12} /> : null}
            {busy ? 'Saving…' : 'Save changes'}
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
          Leave a secret blank to keep the one already stored — they cannot be shown, so an empty
          box means “unchanged”, not “clear it”.
        </p>

        {field('workspaceName', 'Workspace name', { placeholder: 'Northwind' })}

        <Section
          title="Perfox connection"
          note={editing.has_api_token ? 'A key is stored. Type a new one only to replace it.' : 'No key stored yet.'}
        />
        {field('perfoxApiBase', 'API base', {
          placeholder: 'https://acme-api.perfox.ai/api/v1',
          hint: 'No trailing slash — it builds //agents, which answers 401 and reads like a bad key.',
        })}
        {field('perfoxApiToken', 'API key', { secret: true, placeholder: 'sk_…' })}

        <Section
          title="Operator calling"
          note="Only if this workspace places calls. A different credential from the API key."
        />
        {field('operatorApiHost', 'Operator API host', { placeholder: 'https://acme-api.perfox.ai' })}
        {field('operatorSiteId', 'Site ID', { placeholder: 'sa_site_live_…' })}
        {field('operatorSiteSecret', 'Site secret', { secret: true, placeholder: 'sa_secret_live_…' })}
        {field('operatorWorkflowId', 'Workflow ID (optional)')}
      </div>
    </Modal>
  )
}

function Section({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mt-1 border-t border-line pt-4">
      <h3 className="text-[10.5px] font-semibold tracking-[0.07em] text-ink-3 uppercase">{title}</h3>
      {note && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{note}</p>}
    </div>
  )
}
