import { useCallback, useState } from 'react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { FormField, Tabs, controlClass } from '../../components/ui/Field'
import { IconAlert, IconEye, IconEyeOff } from '../../components/icons'
import { cn } from '../../lib/cn'
import { useResource } from '../../lib/useResource'
import { adminApi, type CustomerDetail, type CustomerRow, type NewCustomer } from '../../lib/admin'
import { OperatorHelp, PerfoxHelp } from './CredentialHelp'

const TABS = [
  { id: 'perfox', label: 'Perfox connection' },
  { id: 'operator', label: 'Operation details' },
] as const

/** Both secrets, once fetched. One call returns the pair. */
interface Revealed {
  perfoxApiToken: string | null
  operatorSiteSecret: string | null
}

/**
 * Changing an existing workspace's connection.
 *
 * The form starts from what is stored: the workspace name, the API base, the
 * operator host, site id and workflow id all come back and fill themselves in.
 * They are configuration, not credentials, and making an admin retype them to
 * change one of them was busywork that lost the others.
 *
 * The workspace name stays at the top, since it belongs to neither half. The
 * two sets of credentials are tabs rather than one column: they are alternative
 * answers to "what am I here to change?", and stacking them made a dialog
 * nobody could see the bottom of.
 *
 * The two secrets arrive masked, with an eye to reveal them. Revealing is its
 * own request — see `adminApi.reveal` — so nothing is decrypted until somebody
 * asks, and every ask is in the audit trail. The pair comes back together and
 * is held here rather than in each field, so looking at both, or switching
 * tabs and looking again, is one entry in that trail rather than four.
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
  const load = useCallback(
    async () => (await adminApi.customer(editing.workspace_id)).customer,
    [editing.workspace_id],
  )
  const { data: saved, status } = useResource<CustomerDetail | null>(load, null, [
    editing.workspace_id,
  ])

  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('perfox')
  const [changes, setChanges] = useState<Partial<NewCustomer>>({})
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** What is in the box: the edit if there is one, otherwise what is stored. */
  const valueOf = (key: keyof NewCustomer, stored: string | null | undefined) =>
    changes[key] ?? stored ?? ''

  const set = (key: keyof NewCustomer) => (value: string) =>
    setChanges((prev) => ({ ...prev, [key]: value }))

  const reveal = useCallback(async () => {
    if (revealed) return
    setRevealed(await adminApi.reveal(editing.workspace_id))
  }, [revealed, editing.workspace_id])

  const loading = status === 'loading'
  const ready = !loading && !busy && valueOf('workspaceName', saved?.workspaceName).trim() !== ''

  async function submit() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      // Only what was touched, whichever tab it was on. The user's name, email
      // and password are theirs to change, not an admin's to overwrite, and an
      // untouched secret must not be resent as an empty string.
      await adminApi.updateCustomer(editing.workspace_id, changes)
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
    stored: string | null | undefined,
    opts: { placeholder?: string; hint?: string } = {},
  ) => (
    <FormField label={label} hint={opts.hint}>
      {(id) => (
        <input
          id={id}
          type="text"
          value={valueOf(key, stored)}
          placeholder={loading ? 'Loading…' : opts.placeholder}
          disabled={loading}
          // Off for every field here: none of this is the admin's own detail,
          // and a browser offering to remember a customer's API key is exactly
          // the wrong thing to have happen.
          autoComplete="off"
          onChange={(e) => set(key)(e.target.value)}
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

        {/* Above the tabs, because it belongs to neither of them. */}
        {field('workspaceName', 'Workspace name', saved?.workspaceName, {
          placeholder: 'Northwind',
        })}

        <Tabs
          tabs={TABS}
          value={tab}
          onChange={(id) => setTab(id as (typeof TABS)[number]['id'])}
          className="border-b border-line"
        />

        {/**
         * One height for both tabs, and the taller one scrolls inside it.
         *
         * Operation details carries two more fields than Perfox connection, so
         * switching tabs grew the dialog by 130px and moved the buttons out
         * from under the pointer. A fixed panel keeps the box the size it was
         * when it opened; `pr-1` leaves the focus ring somewhere to be drawn
         * when a scrollbar appears beside it.
         */}
        <div className="h-60 overflow-y-auto pr-1">
          <div className="flex flex-col gap-4">
            {tab === 'perfox' ? (
              <>
                <PerfoxHelp collapsible />
                {field('perfoxApiBase', 'API base', saved?.perfoxApiBase, {
                  placeholder: 'https://acme-api.perfox.ai/api/v1',
                  hint: 'No trailing slash — it builds //agents, which answers 401 and reads like a bad key.',
                })}
                <Secret
                  label="API key"
                  stored={saved?.hasApiToken ?? false}
                  placeholder="sk_…"
                  revealed={revealed?.perfoxApiToken ?? null}
                  onReveal={reveal}
                  value={changes.perfoxApiToken}
                  onChange={set('perfoxApiToken')}
                />
              </>
            ) : (
              <>
                <OperatorHelp collapsible />
                {field('operatorApiHost', 'Operator API host', saved?.operatorApiHost, {
                  placeholder: 'https://acme-api.perfox.ai',
                })}
                {field('operatorSiteId', 'Site ID', saved?.operatorSiteId, {
                  placeholder: 'sa_site_live_…',
                })}
                <Secret
                  label="Site secret"
                  stored={saved?.hasSiteSecret ?? false}
                  placeholder="sa_secret_live_…"
                  revealed={revealed?.operatorSiteSecret ?? null}
                  onReveal={reveal}
                  value={changes.operatorSiteSecret}
                  onChange={set('operatorSiteSecret')}
                />
                {field('operatorWorkflowId', 'Workflow ID (optional)', saved?.operatorWorkflowId)}
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/**
 * A stored secret: dots, and an eye.
 *
 * Masked until asked for, and asking fetches it — the value is not in the page
 * before that, so closing the dialog without pressing the eye means no
 * credential was ever sent to this browser. Pressing it again hides the value
 * without dropping it, so a second look costs nothing.
 *
 * Typing replaces it, which is the other half of the field's job.
 */
function Secret({
  label,
  stored,
  revealed,
  onReveal,
  value,
  onChange,
  placeholder,
}: {
  label: string
  /** Whether there is one to reveal at all. */
  stored: boolean
  /** The decrypted value, once the dialog has fetched it. */
  revealed: string | null
  onReveal: () => Promise<void>
  /** The edit, if the admin has typed one. */
  value: string | undefined
  onChange: (value: string) => void
  /** Shown only when there is nothing stored to mask. */
  placeholder: string
}) {
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const typed = value !== undefined

  async function toggle() {
    if (shown) {
      setShown(false)
      return
    }
    // Typed values are already on screen, and a fetched one is already held.
    if (typed || revealed !== null) {
      setShown(true)
      return
    }

    setBusy(true)
    setFailed(null)
    try {
      await onReveal()
      setShown(true)
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // What the box holds: the edit, else the revealed value, else nothing —
  // and nothing means "leave the stored one alone".
  const boxValue = typed ? value : shown ? (revealed ?? '') : ''

  return (
    <FormField
      label={label}
      hint={failed ?? (stored && typed ? 'Saving replaces the stored one.' : undefined)}
      hintTone={failed ? 'warn' : 'muted'}
    >
      {(id) => (
        <div className="relative flex items-center">
          <input
            id={id}
            type={shown ? 'text' : 'password'}
            value={boxValue}
            placeholder={stored && !typed && !shown ? '••••••••' : placeholder}
            autoComplete="off"
            onChange={(e) => onChange(e.target.value)}
            className={cn(controlClass, 'h-10 pr-10')}
          />
          {(stored || typed) && (
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={busy}
              aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
              aria-pressed={shown}
              className="absolute right-1 flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-muted-bg hover:text-ink disabled:text-ink-4"
            >
              {busy ? <Spinner size={12} /> : shown ? <IconEyeOff size={15} /> : <IconEye size={15} />}
            </button>
          )}
        </div>
      )}
    </FormField>
  )
}
