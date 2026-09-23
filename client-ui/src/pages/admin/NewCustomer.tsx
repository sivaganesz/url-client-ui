import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import { FormField, controlClass } from '../../components/ui/Field'
import { IconAlert, IconCheck, IconChevronLeft } from '../../components/icons'
import { cn } from '../../lib/cn'
import { adminApi, type NewCustomer as NewCustomerInput } from '../../lib/admin'

const MIN_LENGTH = 12

const EMPTY: NewCustomerInput = {
  workspaceName: '',
  name: '',
  email: '',
  mobile: '',
  password: '',
  perfoxApiBase: '',
  perfoxApiToken: '',
  operatorApiHost: '',
  operatorSiteId: '',
  operatorSiteSecret: '',
  operatorWorkflowId: '',
}

/**
 * Adding a customer: everything in one pass, on a page of its own.
 *
 * It was a dialog, which meant three sections of a fifteen-field form inside a
 * box that scrolls independently of the page behind it — and the thing that
 * matters most, the sign-in to hand over, disappeared the moment it closed.
 *
 * A page has room for the three groups to be read as groups, and for the
 * result to be a result: the email and password stay on screen, once, with
 * what to do with them said out loud. Nothing can show them again afterwards,
 * because no endpoint returns a password.
 */
export default function NewCustomer() {
  const navigate = useNavigate()
  const [f, setF] = useState<NewCustomerInput>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ email: string; password: string; workspace: string } | null>(
    null,
  )

  const tooShort = f.password !== '' && f.password.length < MIN_LENGTH
  const ready =
    f.workspaceName.trim() !== '' &&
    f.name.trim() !== '' &&
    f.email.trim() !== '' &&
    f.password.length >= MIN_LENGTH &&
    !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await adminApi.createCustomer(f)
      // Held from what was typed, not read back — nothing returns a password.
      setDone({ email: f.email.trim(), password: f.password, workspace: f.workspaceName.trim() })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const field = (
    key: keyof NewCustomerInput,
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
          // Off for every field: none of this is the admin's own detail, and a
          // browser offering to remember a customer's API key is exactly the
          // wrong thing to have happen.
          autoComplete="off"
          onChange={(e) => setF((prev) => ({ ...prev, [key]: e.target.value }))}
          className={cn(controlClass, 'h-10')}
        />
      )}
    </FormField>
  )

  if (done) return <Created {...done} onAnother={() => setDone(null)} />

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink"
        >
          <IconChevronLeft size={13} />
          Customers
        </Link>
        <h1 className="mt-2 text-[17px] font-semibold tracking-tight">Add a customer</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
          Creates the workspace and the sign-in that reaches it. The connection details can be
          filled in now or left until later — the account works without them and says it is not
          connected.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger-bg px-3.5 py-3"
        >
          <IconAlert size={15} className="mt-0.5 shrink-0 text-danger" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-2">{error}</p>
        </div>
      )}

      <Group
        step={1}
        title="Customer details"
        note="Who they are, and what they sign in with."
      >
        {field('workspaceName', 'Workspace name', { placeholder: 'Northwind' })}
        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', 'Contact name')}
          {field('email', 'Email', { type: 'email', placeholder: 'name@northwind.com' })}
          {field('mobile', 'Mobile (optional)', { type: 'tel', placeholder: '+91 9342022401' })}
          {field('password', 'Password', {
            secret: true,
            hint: tooShort
              ? `Use at least ${MIN_LENGTH} characters.`
              : `At least ${MIN_LENGTH} characters. You hand it over yourself.`,
          })}
        </div>
      </Group>

      <Group
        step={2}
        title="Perfox credentials"
        note="What the console reads conversations, agents and calls through."
      >
        {field('perfoxApiBase', 'API base', {
          placeholder: 'https://acme-api.perfox.ai/api/v1',
          hint: 'No trailing slash — it builds //agents, which answers 401 and reads like a bad key.',
        })}
        {field('perfoxApiToken', 'API key', { secret: true, placeholder: 'sk_…' })}
      </Group>

      <Group
        step={3}
        title="Operator details"
        note="Only if this workspace places calls. A different credential from the API key — one does not authorise the other."
      >
        {field('operatorApiHost', 'Operator API host', { placeholder: 'https://acme-api.perfox.ai' })}
        <div className="grid gap-4 sm:grid-cols-2">
          {field('operatorSiteId', 'Site ID', { placeholder: 'sa_site_live_…' })}
          {field('operatorSiteSecret', 'Site secret', {
            secret: true,
            placeholder: 'sa_secret_live_…',
          })}
        </div>
        {field('operatorWorkflowId', 'Workflow ID (optional)')}
      </Group>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="md" type="button" onClick={() => navigate('/admin')}>
          Cancel
        </Button>
        <Button variant="primary" size="md" type="submit" disabled={!ready}>
          {busy ? <Spinner size={12} /> : null}
          {busy ? 'Creating…' : 'Create customer'}
        </Button>
      </div>
    </form>
  )
}

/** One numbered group of fields. The number is the reading order, not a wizard. */
function Group({
  step,
  title,
  note,
  children,
}: {
  step: number
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand"
        >
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{note}</p>
        </div>
      </div>
      {children}
    </Card>
  )
}

/**
 * What to do next, with the two things nobody can look up afterwards.
 *
 * The password is on screen exactly once — this is the only moment it exists
 * outside the admin's head, since it is stored as an argon2 hash and no
 * endpoint returns it. Saying so is the difference between a page someone
 * reads and a support ticket next week.
 */
function Created({
  email,
  password,
  workspace,
  onAnother,
}: {
  email: string
  password: string
  workspace: string
  onAnother: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; the values are on screen regardless.
      setCopied(false)
    }
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-5">
      <Card className="flex flex-col items-center gap-4 px-6 py-8 text-center">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-bg text-ok"
        >
          <IconCheck size={24} />
        </span>

        <div>
          <h1 className="text-[17px] font-semibold tracking-tight">{workspace} is set up</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
            Please share these customer credentials with the customer. They can use this email and
            password to log in.
          </p>
        </div>

        <dl className="w-full max-w-sm overflow-hidden rounded-card border border-line text-left">
          <Detail label="Email" value={email} />
          <Detail label="Password" value={password} last />
        </dl>

        <p className="text-[11.5px] leading-relaxed text-ink-3">
          The password is not shown again. It is stored as a hash, so nothing here — and nobody
          here — can read it back.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="md" onClick={copy}>
            {copied ? <IconCheck size={13} /> : null}
            {copied ? 'Copied' : 'Copy both'}
          </Button>
          <Button size="md" onClick={onAnother}>
            Add another
          </Button>
          <Link to="/admin">
            <Button variant="primary" size="md">
              Back to customers
            </Button>
          </Link>
        </div>
      </Card>
    </section>
  )
}

function Detail({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cn('flex items-baseline gap-3 px-4 py-3', !last && 'border-b border-line')}>
      <dt className="w-20 shrink-0 text-[11.5px] text-ink-3">{label}</dt>
      <dd className="min-w-0 flex-1 font-mono text-[12.5px] break-all text-ink select-all">
        {value}
      </dd>
    </div>
  )
}
