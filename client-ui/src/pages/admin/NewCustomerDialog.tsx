import { useState } from 'react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { FormField, controlClass } from '../../components/ui/Field'
import { IconAlert } from '../../components/icons'
import { cn } from '../../lib/cn'
import { adminApi, type CustomerRow, type NewCustomer } from '../../lib/admin'

/**
 * Creating a customer: the workspace, its first user, and the Perfox
 * connection.
 *
 * This is what replaced the interactive prompts in `npm run seed`.
 *
 * It is the one place in the product where a raw Perfox key is typed, which is
 * unavoidable — somebody has to enter it — so the handling is deliberate. The
 * secrets are password fields with autocomplete off, they are never read back
 * from the server afterwards, and the only way to change one later is to type
 * it again. Nothing here can display an existing credential, because no
 * endpoint returns one.
 */
export default function NewCustomerDialog({
  onClose,
  onSaved,
  editing,
}: {
  onClose: () => void
  onSaved: () => void
  /** Set to change an existing workspace's connection rather than create one. */
  editing?: CustomerRow
}) {
  const isEdit = Boolean(editing)
  const [f, setF] = useState<NewCustomer>({
    workspaceName: editing?.workspace_name ?? '',
    name: '',
    email: '',
    mobile: '',
    password: '',
    perfoxApiBase: editing?.perfox_api_base ?? '',
    perfoxApiToken: '',
    operatorApiHost: '',
    operatorSiteId: '',
    operatorSiteSecret: '',
    operatorWorkflowId: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof NewCustomer) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }))

  const tooShort = !isEdit && f.password !== '' && f.password.length < 12
  const ready = isEdit
    ? f.workspaceName.trim() !== '' && !busy
    : f.workspaceName.trim() !== '' &&
      f.name.trim() !== '' &&
      f.email.trim() !== '' &&
      f.password.length >= 12 &&
      !busy

  async function submit() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      if (editing) {
        // Only the connection, and only what was filled in. The user's name,
        // email and password are theirs to change, not an admin's to overwrite.
        await adminApi.updateCustomer(editing.workspace_id, {
          workspaceName: f.workspaceName,
          perfoxApiBase: f.perfoxApiBase,
          perfoxApiToken: f.perfoxApiToken,
          operatorApiHost: f.operatorApiHost,
          operatorSiteId: f.operatorSiteId,
          operatorSiteSecret: f.operatorSiteSecret,
          operatorWorkflowId: f.operatorWorkflowId,
        })
      } else {
        await adminApi.createCustomer(f)
      }
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
    opts: { type?: string; placeholder?: string; hint?: string; secret?: boolean } = {},
  ) => (
    <FormField label={label} hint={opts.hint}>
      {(id) => (
        <input
          id={id}
          type={opts.secret ? 'password' : (opts.type ?? 'text')}
          value={f[key] ?? ''}
          placeholder={opts.placeholder}
          // Off for every field here: none of this is the admin's own detail,
          // and a browser offering to remember a customer's API key is exactly
          // the wrong thing to have happen.
          autoComplete="off"
          onChange={set(key)}
          className={cn(controlClass, 'h-10')}
        />
      )}
    </FormField>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Change the connection' : 'Add a customer'}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="md" disabled={!ready} onClick={submit}>
            {busy ? <Spinner size={12} /> : null}
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
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
          {isEdit
            ? 'Leave a secret blank to keep the one already stored — they cannot be shown, so an empty box means "unchanged", not "clear it".'
            : 'Creates the workspace and its first sign-in. Give the email and password to the customer yourself — neither is shown again.'}
        </p>

        {field('workspaceName', 'Workspace name', { placeholder: 'Northwind' })}

        {!isEdit && (
          <>
            <Section title="Who signs in" />
            {field('name', 'Contact name')}
            {field('email', 'Email', { type: 'email', placeholder: 'name@northwind.com' })}
            {field('mobile', 'Mobile (optional)', { type: 'tel', placeholder: '+91 9342022401' })}
            {field('password', 'Password', {
              secret: true,
              hint: tooShort
                ? 'Use at least 12 characters.'
                : 'At least 12 characters. Give it to them yourself.',
            })}
          </>
        )}

        <Section
          title="Perfox connection"
          note={
            isEdit
              ? editing?.has_api_token
                ? 'A key is stored. Type a new one only to replace it.'
                : 'No key stored yet.'
              : 'Optional now — the account works without it and says it is not connected.'
          }
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
