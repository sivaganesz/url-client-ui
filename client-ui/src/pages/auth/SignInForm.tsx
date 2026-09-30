import { useState } from 'react'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { FormField, controlClass } from '../../components/ui/Field'
import { IconAlert, IconEye, IconEyeOff } from '../../components/icons'
import { cn } from '../../lib/cn'

/**
 * The email-and-password form, shared by both sign-in pages.
 *
 * Shared on purpose: the two differ in where they post and what they say, not
 * in how they behave. Two copies would drift, and the half that drifted would
 * be the admin one, which is used less and matters more.
 */
export default function SignInForm({
  onSubmit,
  submitLabel = 'Sign in',
  busyLabel = 'Signing in…',
}: {
  onSubmit: (email: string, password: string) => Promise<void>
  submitLabel?: string
  busyLabel?: string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(false)

  const ready = email.trim() !== '' && password !== '' && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(email.trim(), password)
    } catch (err) {
      setError((err as Error).message)
      // The password, not the address: retyping an email is a nuisance and it
      // was not the thing that was wrong.
      setPassword('')
      // And hidden again, so the next attempt is not typed in the clear
      // because the last one happened to be revealed.
      setShown(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-card border border-danger/25 bg-danger-bg px-3.5 py-3"
        >
          <IconAlert size={15} className="mt-0.5 shrink-0 text-danger" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-2">{error}</p>
        </div>
      )}

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
          <div className="relative flex items-center">
            <input
              id={id}
              type={shown ? 'text' : 'password'}
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              className={cn(controlClass, 'h-10 pr-10')}
            />
            {/* Only once there is something to reveal, so an empty field is
                not decorated with a control that would do nothing. */}
            {password !== '' && (
              <button
                type="button"
                onClick={() => setShown((s) => !s)}
                aria-label={shown ? 'Hide password' : 'Show password'}
                aria-pressed={shown}
                // Not a submit: inside a form, a bare button is one, and
                // clicking the eye would try to sign in.
                className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-muted-bg hover:text-ink"
              >
                {shown ? <IconEyeOff size={15} /> : <IconEye size={15} />}
              </button>
            )}
          </div>
        )}
      </FormField>

      <Button type="submit" variant="primary" size="lg" disabled={!ready} className="mt-1 w-full">
        {busy ? <Spinner size={13} /> : null}
        {busy ? busyLabel : submitLabel}
      </Button>
    </form>
  )
}
