import { useState } from 'react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import { FormField, controlClass } from './ui/Field'
import { IconAlert } from './icons'
import { cn } from '../lib/cn'

/** The backend's floor, repeated here so the form can say it before submitting. */
const MIN_LENGTH = 12

/**
 * Changing your own password, on either surface.
 *
 * `POST /auth/password` and `POST /admin/password` have existed since the
 * login work and took the same body, but nothing in the product called
 * either — so the only way anyone could change a password was for someone
 * with database access to do it for them.
 *
 * One dialog for both, taking the caller's own function rather than a URL:
 * each surface already has a place where its calls live and where a server's
 * wording is turned into an Error, and this should not be the one call that
 * goes around it.
 *
 * Both endpoints end every other session and re-issue the current one, which
 * is the point of changing a password: a person who thinks theirs has been
 * taken needs the other sessions gone, not kept alive. The note says so,
 * because "you have been signed out everywhere else" is alarming when it is
 * unexplained and reassuring when it is not.
 */
export default function ChangePasswordDialog({
  submit: send,
  onClose,
}: {
  submit: (currentPassword: string, newPassword: string) => Promise<void>
  onClose: () => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const tooShort = next !== '' && next.length < MIN_LENGTH
  const mismatch = again !== '' && next !== again
  const ready = current !== '' && next.length >= MIN_LENGTH && next === again && !busy

  async function submit() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await send(current, next)
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts: { hint?: string; autoComplete: string } = { autoComplete: 'off' },
  ) => (
    <FormField label={label} hint={opts.hint} hintTone={opts.hint ? 'warn' : 'muted'}>
      {(id) => (
        <input
          id={id}
          type="password"
          value={value}
          autoComplete={opts.autoComplete}
          onChange={(e) => onChange(e.target.value)}
          className={cn(controlClass, 'h-10')}
        />
      )}
    </FormField>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={done ? 'Password changed' : 'Change your password'}
      footer={
        done ? (
          <Button variant="primary" size="md" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="md" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" size="md" disabled={!ready} onClick={submit}>
              {busy ? <Spinner size={12} /> : null}
              {busy ? 'Changing…' : 'Change password'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          Your password has been changed, and every other sign-in has been ended. This one is still
          good — you do not need to sign in again here.
        </p>
      ) : (
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
            Any other sign-in will be ended. Length is the only rule —{' '}
            {MIN_LENGTH} characters or more, and a passphrase counts.
          </p>

          {field('Current password', current, setCurrent, { autoComplete: 'current-password' })}
          {field('New password', next, setNext, {
            autoComplete: 'new-password',
            hint: tooShort ? `Use at least ${MIN_LENGTH} characters.` : undefined,
          })}
          {field('New password again', again, setAgain, {
            autoComplete: 'new-password',
            hint: mismatch ? 'These two do not match.' : undefined,
          })}
        </div>
      )}
    </Modal>
  )
}
