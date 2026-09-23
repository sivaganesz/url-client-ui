import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Spinner from '../../components/ui/Spinner'
import { FormField, controlClass } from '../../components/ui/Field'
import { IconAlert, IconCheck, IconChevronLeft, IconChevronRight, IconCopy } from '../../components/icons'
import { cn } from '../../lib/cn'
import { adminApi, type NewCustomer as NewCustomerInput } from '../../lib/admin'
import { OperatorHelp, PerfoxHelp } from './CredentialHelp'

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

const STEPS = [
  { title: 'Customer details', note: 'Who they are, and what they sign in with.' },
  { title: 'Perfox credentials', note: 'What the console reads conversations, agents and calls through.' },
  {
    title: 'Operator details',
    note: 'Only if this workspace places calls. A different credential from the API key — one does not authorise the other.',
  },
] as const

/**
 * Adding a customer, in three steps.
 *
 * It was a dialog: fifteen fields in three groups inside a box that scrolls
 * independently of the page behind it, and the thing that mattered most — the
 * sign-in to hand over — vanished the moment it closed.
 *
 * Only the first step is required. The other two are credentials that often
 * arrive later, so Next carries on through them empty and the account is
 * created saying it is not connected, rather than blocking on something the
 * admin has not been given yet.
 *
 * Nothing is submitted until the last step, and nothing is lost going
 * backwards: the form is one object held across all three.
 */
export default function NewCustomer() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [f, setF] = useState<NewCustomerInput>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ email: string; password: string; workspace: string } | null>(
    null,
  )

  const tooShort = f.password !== '' && f.password.length < MIN_LENGTH
  /** Step one is the only one that has to be filled in. */
  const detailsReady =
    f.workspaceName.trim() !== '' &&
    f.name.trim() !== '' &&
    f.email.trim() !== '' &&
    f.password.length >= MIN_LENGTH

  const last = step === STEPS.length - 1

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Enter on an earlier step moves on rather than creating the customer —
    // submitting from step one would skip two steps the admin can still see.
    if (!last) {
      if (step > 0 || detailsReady) setStep((s) => s + 1)
      return
    }
    if (busy) return

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

  if (done) return <Created {...done} onAnother={() => { setDone(null); setF(EMPTY); setStep(0) }} />

  const current = STEPS[step]!

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
      </div>

      <Steps current={step} reached={detailsReady} onGo={setStep} />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger-bg px-3.5 py-3"
        >
          <IconAlert size={15} className="mt-0.5 shrink-0 text-danger" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-2">{error}</p>
        </div>
      )}

      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-[13.5px] font-semibold text-ink">{current.title}</h2>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{current.note}</p>
        </div>

        {step === 0 && (
          <>
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
          </>
        )}

        {step === 1 && (
          <>
            <PerfoxHelp />
            {field('perfoxApiBase', 'API base', {
              placeholder: 'https://acme-api.perfox.ai/api/v1',
              hint: 'No trailing slash — it builds //agents, which answers 401 and reads like a bad key.',
            })}
            {field('perfoxApiToken', 'API key', { secret: true, placeholder: 'sk_…' })}
            <Skippable>
              Leave these blank if the key has not arrived yet. The account works, and says it is
              not connected until one is added.
            </Skippable>
          </>
        )}

        {step === 2 && (
          <>
            <OperatorHelp />
            {field('operatorApiHost', 'Operator API host', {
              placeholder: 'https://acme-api.perfox.ai',
            })}
            <div className="grid gap-4 sm:grid-cols-2">
              {field('operatorSiteId', 'Site ID', { placeholder: 'sa_site_live_…' })}
              {field('operatorSiteSecret', 'Site secret', {
                secret: true,
                placeholder: 'sa_secret_live_…',
              })}
            </div>
            {field('operatorWorkflowId', 'Workflow ID (optional)')}
            <Skippable>
              Leave these blank if this workspace does not place calls. The Call button then says
              so rather than failing when it is pressed.
            </Skippable>
          </>
        )}
      </Card>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="md"
          type="button"
          onClick={() => (step === 0 ? navigate('/admin') : setStep((s) => s - 1))}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>

        {last ? (
          <Button variant="primary" size="md" type="submit" disabled={!detailsReady || busy}>
            {busy ? <Spinner size={12} /> : null}
            {busy ? 'Creating…' : 'Submit'}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            type="submit"
            disabled={step === 0 && !detailsReady}
          >
            Next
            <IconChevronRight size={13} />
          </Button>
        )}
      </div>
    </form>
  )
}

/**
 * 1 → 2 → 3, and which one you are on.
 *
 * A completed step can be returned to by clicking it; one that has not been
 * reached cannot be jumped to, because step one carries the only fields that
 * are required and skipping it would present a Submit that refuses.
 */
function Steps({
  current,
  reached,
  onGo,
}: {
  current: number
  /** Whether step one is filled in, which is what unlocks the rest. */
  reached: boolean
  onGo: (step: number) => void
}) {
  return (
    <ol className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const state = i === current ? 'current' : i < current ? 'done' : 'todo'
        const canGo = i < current || (reached && i > current)

        return (
          <li key={s.title} className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              disabled={!canGo}
              aria-current={state === 'current' ? 'step' : undefined}
              onClick={() => canGo && onGo(i)}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1 transition-colors',
                state === 'current'
                  ? 'border-brand-line bg-brand-soft'
                  : 'border-transparent hover:bg-muted-bg',
                !canGo && state !== 'current' && 'cursor-default hover:bg-transparent',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  state === 'done'
                    ? 'bg-ok text-white'
                    : state === 'current'
                      ? 'bg-brand text-white'
                      : 'bg-muted-bg text-ink-4',
                )}
              >
                {state === 'done' ? <IconCheck size={12} /> : i + 1}
              </span>
              <span
                className={cn(
                  'truncate text-[12px]',
                  state === 'current' ? 'font-semibold text-brand-dark' : 'text-ink-3',
                )}
              >
                {s.title}
              </span>
            </button>

            {i < STEPS.length - 1 && (
              <IconChevronRight size={13} className="shrink-0 text-ink-4" aria-hidden="true" />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Says a step can be left empty, so nobody hunts for a value they lack. */
function Skippable({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-sunken px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-3">
      {children}
    </p>
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
  return (
    <section className="settle-in mx-auto flex w-full max-w-lg flex-col items-center py-6 sm:py-10">
      {/* Concentric rings rather than a flat disc: the tick reads as the
          subject of the page at a glance, without a graphic that has to be
          drawn twice for dark mode. */}
      <span
        aria-hidden="true"
        className="flex h-20 w-20 items-center justify-center rounded-full bg-ok/8"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ok/15">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ok text-white shadow-card">
            <IconCheck size={22} />
          </span>
        </span>
      </span>

      <h1 className="mt-5 text-center text-[20px] font-semibold tracking-tight">
        {workspace} is set up
      </h1>
      {/* Two lines, not a wrapped one: the first says what to do, the second
          says what it is for, and a break between them keeps the instruction
          from reading as a paragraph to skim. */}
      <p className="mt-2 max-w-md text-center text-[13px] leading-relaxed text-ink-2">
        Please share these customer credentials with the customer.
        <span className="block">They can use this email and password to log in.</span>
      </p>

      <dl className="mt-7 w-full overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-sunken px-4 py-2">
          <span className="text-[10.5px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
            Sign-in details
          </span>
          {/* One button for the pair. They are handed over together, in one
              message, so copying them one at a time only makes the person
              paste twice and reassemble what they already had. */}
          <CopyBoth email={email} password={password} />
        </div>
        <Detail label="Email" value={email} />
        <Detail label="Password" value={password} last />
      </dl>

      {/* The one thing that is irreversible about this page, said where it
          cannot be missed rather than as a footnote under the buttons. */}
      <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-3">
        <IconAlert size={13} className="mt-0.5 shrink-0 text-warn" />
        <span>
          The password is not shown again — it is stored as a hash, so nothing here, and nobody
          here, can read it back.
        </span>
      </p>

      <div className="mt-7 flex w-full flex-col-reverse items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
        <Button size="md" onClick={onAnother}>
          Add another
        </Button>
        <Link to="/admin" className="sm:w-auto">
          <Button variant="primary" size="md" className="w-full">
            Back to customers
          </Button>
        </Link>
      </div>
    </section>
  )
}

/**
 * Both credentials, as the two lines they get pasted as.
 *
 * Labelled rather than bare values, because what lands in the message has to
 * say which is which on its own — a paste of two strings is a guess at the
 * other end.
 */
function CopyBoth({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`email : ${email}\npassword : ${password}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused; both values are on screen regardless.
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-medium transition-colors',
        copied
          ? 'border-ok/30 bg-ok-bg text-ok'
          : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken hover:text-ink',
      )}
    >
      {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Detail({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cn('flex items-baseline gap-3 px-4 py-3', !last && 'border-b border-line')}>
      <dt className="w-[74px] shrink-0 text-[11.5px] text-ink-3">{label}</dt>
      <dd className="min-w-0 flex-1 font-mono text-[12.5px] break-all text-ink select-all">
        {value}
      </dd>
    </div>
  )
}
