import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { FormField, controlClass } from '../components/ui/Field'
import { IconAlert, IconChat } from '../components/icons'
import { cn } from '../lib/cn'
import { useSession } from '../lib/session'

export default function Login() {
  const { status, signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'signed-in') {
    // Back to wherever the guard interrupted, or the dashboard.
    const to = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={to} replace />
  }

  const ready = email.trim() !== '' && password !== '' && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      // Not the email: retyping it is a nuisance and it is not the secret.
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Your workspace, your conversations."
      footer={
        <>
          No account?{' '}
          <Link to="/register" className="font-medium text-brand hover:underline">
            Request one
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <AuthError>{error}</AuthError>}

        <FormField label="Email">
          {(id) => (
            <input
              id={id}
              type="email"
              value={email}
              autoComplete="username"
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              className={cn(controlClass, 'h-10')}
            />
          )}
        </FormField>

        <FormField label="Password">
          {(id) => (
            <input
              id={id}
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              className={cn(controlClass, 'h-10')}
            />
          )}
        </FormField>

        <Button type="submit" variant="primary" size="lg" disabled={!ready} className="mt-1 w-full">
          {busy ? <Spinner size={13} /> : null}
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}

/* ── shared between Login and Register ───────────────────── */

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <main className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
            <IconChat size={19} />
          </span>
          <div>
            <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>}
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface p-6 shadow-card">{children}</div>

        {footer && <p className="mt-5 text-center text-[12.5px] text-ink-3">{footer}</p>}
      </main>
    </div>
  )
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger-bg px-3.5 py-3"
    >
      <IconAlert size={15} className="mt-0.5 shrink-0 text-danger" />
      <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-2">{children}</p>
    </div>
  )
}
