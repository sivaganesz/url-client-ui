import { useCallback, useEffect, useRef, useState } from 'react'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { FormField, Tabs, controlClass } from '../../components/ui/Field'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { IconAlert, IconEye, IconEyeOff } from '../../components/icons'
import { cn } from '../../lib/cn'
import { useResource } from '../../lib/useResource'
import { adminApi, type CustomerDetail, type CustomerRow, type NewCustomer } from '../../lib/admin'
import { OperatorHelp, PerfoxHelp } from './CredentialHelp'

const TABS = [
  { id: 'profile', label: 'Customer profile' },
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

  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('profile')
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

  /**
   * What is on file for a field, so an edit can be compared against it.
   *
   * The two secrets have no entry: there is no plaintext to compare with,
   * so anything typed into them counts as a change and an untouched one —
   * which stays empty — does not.
   */
  const storedFor: Partial<Record<keyof NewCustomer, string | null | undefined>> = {
    workspaceName: saved?.workspaceName,
    name: saved?.ownerName,
    mobile: saved?.ownerMobile,
    perfoxApiBase: saved?.perfoxApiBase,
    operatorApiHost: saved?.operatorApiHost,
    operatorSiteId: saved?.operatorSiteId,
    operatorWorkflowId: saved?.operatorWorkflowId,
  }

  /**
   * Whether there is anything to save, across all three tabs.
   *
   * Compared against what is stored rather than counting keystrokes, so
   * typing into a field and undoing it leaves the button where it was.
   * Revealing a secret is not an edit either — that writes to `revealed`,
   * which nothing here reads.
   */
  const dirty = Object.entries(changes).some(([key, value]) => {
    const now = String(value ?? '').trim()
    const before = String(storedFor[key as keyof NewCustomer] ?? '').trim()
    return now !== before
  })

  const ready =
    !loading &&
    !busy &&
    dirty &&
    valueOf('workspaceName', saved?.workspaceName).trim() !== '' &&
    valueOf('name', saved?.ownerName).trim() !== ''

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
      // Three tabs now: who the customer is, and the two sets of credentials.
      // "Change the connection" described only the middle one.
      title="Edit customer"
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
            {tab === 'profile' ? (
              <CustomerProfile
                saved={saved}
                workspaceId={editing.workspace_id}
                valueOf={valueOf}
                set={set}
              />
            ) : tab === 'perfox' ? (
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

/**
 * Who the account belongs to, and a way back in for them.
 *
 * Read-only on purpose. The email is the login, so editing it here would
 * change who can sign in — a different decision from this one, and one that
 * deserves its own thought.
 */
function CustomerProfile({
  saved,
  workspaceId,
  valueOf,
  set,
}: {
  saved: CustomerDetail | null
  workspaceId: string
  valueOf: (key: keyof NewCustomer, stored: string | null | undefined) => string
  set: (key: keyof NewCustomer) => (value: string) => void
}) {
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)
  const [asking, setAsking] = useState(false)
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  /**
   * The panel is a fixed 240px and this tab is taller, so a password
   * generated at the bottom of it appears off-screen — you press the button
   * and nothing seems to happen. It scrolls to what it just made.
   */
  const issuedAt = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (issued) issuedAt.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [issued])

  const handover = issued
    ? `email : ${issued.email}\npassword : ${issued.password}`
    : ''

  async function generate() {
    setAsking(false)
    setFailed(null)
    setWorking(true)
    try {
      setIssued(await adminApi.resetPassword(workspaceId))
      setCopied(false)
    } catch (err) {
      setFailed((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        Label and box on one line, so the three read as one block rather
        than three stacked forms. The email sits among them and is the one
        that cannot be typed into: it is what they sign in with, so changing
        it changes who can reach the account. Its shading says so without a
        sentence explaining it.
      */}
      <div className="rounded-card border border-line">
        <Row label="Name">
          <input
            type="text"
            value={valueOf('name', saved?.ownerName)}
            onChange={(e) => set('name')(e.target.value)}
            placeholder="Nora Patel"
            className={cn(rowInput, 'bg-surface')}
          />
        </Row>

        <Row label="Email">
          <input
            type="text"
            value={saved?.ownerEmail ?? ''}
            readOnly
            aria-describedby="email-fixed"
            className={cn(rowInput, 'cursor-default bg-sunken text-ink-3')}
          />
        </Row>

        <Row label="Phone">
          <input
            type="text"
            value={valueOf('mobile', saved?.ownerMobile)}
            onChange={(e) => set('mobile')(e.target.value)}
            placeholder="+91…"
            className={cn(rowInput, 'bg-surface')}
          />
        </Row>
      </div>
      <p id="email-fixed" className="-mt-2 text-[11px] text-ink-3">
        The email is the sign-in address and cannot be changed here.
      </p>

      <div className="rounded-card border border-line p-3">
        <p className="text-[12px] font-medium">Password</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
          There is no reset email in this product. Generate one here and send it to the
          customer; they can change it themselves once they are in. Generating also signs
          them out everywhere.
        </p>

        {issued ? (
          <div ref={issuedAt} className="mt-3">
            {/* One block, the way it gets pasted into a message. */}
            <pre className="rounded-lg bg-sunken px-3 py-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
              {handover}
            </pre>
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(handover)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false))
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <p role="alert" className="text-[11px] text-warn">
                Shown once. Close this and it cannot be read again.
              </p>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-3"
            disabled={working}
            onClick={() => setAsking(true)}
          >
            {working ? 'Generating…' : 'Generate a new password'}
          </Button>
        )}

        {failed && (
          <p role="alert" className="mt-2 text-[11px] text-danger">
            {failed}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={asking}
        title="Generate a new password?"
        body={
          "The password they have now stops working, and anywhere they are signed in is" +
          " signed out. You will see the new one once."
        }
        confirmLabel="Generate"
        tone="danger"
        onConfirm={() => void generate()}
        onCancel={() => setAsking(false)}
      />
    </div>
  )
}

/** One line: what it is on the left, the box on the right. */
const rowInput =
  'min-w-0 flex-1 rounded-md border border-line px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0">
      <span className="w-16 shrink-0 text-[11.5px] text-ink-3">{label}</span>
      {children}
    </label>
  )
}
