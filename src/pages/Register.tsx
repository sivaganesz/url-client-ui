import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'
import { FormField, controlClass } from '../components/ui/Field'
import { cn } from '../lib/cn'
import { useSession } from '../lib/session'
import { AuthError, AuthLayout } from './Login'

/**
 * Registration.
 *
 * The form is real and the endpoint exists, but the backend refuses unless
 * ALLOW_REGISTRATION is set — and it is not, deliberately. This console reads
 * real customer conversations, so a public sign-up form is a door onto them.
 * Accounts are created directly by the team until the invitation flow exists,
 * at which point this page becomes "accept an invitation" and the workspace
 * comes from the invite rather than from whoever filled the form in.
 *
 * It is built now so that switching registration on is a configuration change
 * rather than a release.
 */
export default function Register() {
  const { status } = useSession()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (status === 'signed-in') return <Navigate to="/" replace />

  // Mirrors the backend's rule. Length is the only requirement that reliably
  // helps; composition rules push people towards "Password1!" and towards
  // reusing it somewhere else.
  const tooShort = password !== '' && password.length < 12
  const ready = name.trim() !== '' && email.trim() !== '' && password.length >= 12 && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          mobile: mobile.trim() || undefined,
          password,
        }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? 'Could not create the account.')
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout title="Account created" subtitle="You can sign in now.">
        <Link to="/login">
          <Button variant="primary" size="lg" className="w-full">
            Go to sign in
          </Button>
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Request an account"
      subtitle="Your workspace administrator sets these up."
      footer={
        <>
          Already have one?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <AuthError>{error}</AuthError>}

        <FormField label="Name">
          {(id) => (
            <input
              id={id}
              value={name}
              autoComplete="name"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              className={cn(controlClass, 'h-10')}
            />
          )}
        </FormField>

        <FormField label="Email">
          {(id) => (
            <input
              id={id}
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              className={cn(controlClass, 'h-10')}
            />
          )}
        </FormField>

        <FormField label="Mobile (optional)">
          {(id) => (
            <input
              id={id}
              type="tel"
              value={mobile}
              autoComplete="tel"
              placeholder="+91 9342022401"
              onChange={(e) => setMobile(e.target.value)}
              className={cn(controlClass, 'h-10')}
            />
          )}
        </FormField>

        <FormField
          label="Password"
          hint={tooShort ? 'Use at least 12 characters.' : 'At least 12 characters.'}
          hintTone={tooShort ? 'warn' : undefined}
        >
          {(id) => (
            <input
              id={id}
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              className={cn(controlClass, 'h-10')}
            />
          )}
        </FormField>

        <Button type="submit" variant="primary" size="lg" disabled={!ready} className="mt-1 w-full">
          {busy ? <Spinner size={13} /> : null}
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
