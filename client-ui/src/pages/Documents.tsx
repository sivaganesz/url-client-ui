import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PageBody, PageHeader } from '../components/layout/AppShell'
import Button from '../components/ui/Button'
import DataTable from '../components/ui/DataTable'
import TablePager from '../components/ui/TablePager'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Badge from '../components/ui/Badge'
import DataBanner from '../components/ui/DataBanner'
import Spinner from '../components/ui/Spinner'
import { SearchInput, Select } from '../components/ui/Field'
import { EmptyState } from '../components/ui/States'
import {
  IconChevronRight,
  IconFile,
  IconFolder,
  IconFolderPlus,
  IconGrid,
  IconRows,
  IconUpload,
  IconX,
} from '../components/icons'
import { cn } from '../lib/cn'
import { dateTime } from '../lib/format'
import { usePagination } from '../lib/usePagination'
import { useResource } from '../lib/useResource'
import { uploadAll, type UploadStep } from '../lib/kbUpload'
import {
  createKbFolder,
  deleteKbFile,
  deleteKbFolder,
  fileSize,
  getKbFiles,
  getKbFolders,
  moveKbFile,
  renameKbFolder,
  timeAgo,
  type KbFile,
  type KbFolder,
} from '../lib/api'
import type { Column } from '../components/ui/DataTable'
import type { ShellContext } from '../lib/types'

const PAGE_SIZES = [20, 40, 80]

/** While anything is still being indexed, ask again on this beat. */
const INDEXING_POLL_MS = 4000

/**
 * The documents a workspace answers from.
 *
 * Folders and files in one list rather than two panes: a knowledge base is
 * browsed the way a drive is, and splitting them would mean two scroll
 * positions and two empty states for what is one question — what is in here?
 *
 * Folders sort first and never paginate away from their files, because they
 * are the way further in. Everything else is one page of rows.
 */
export default function Documents() {
  const { openDrawer } = useOutletContext<ShellContext>()

  /** Where we are. Empty is the root; the last entry is the open folder. */
  const [trail, setTrail] = useState<KbFolder[]>([])
  const here = trail.length ? trail[trail.length - 1]! : null
  const hereId = here?.id ?? null

  /**
   * Folders and files together, because the page shows them together.
   *
   * One resource rather than two: two would each have their own loading and
   * error state, and the reader would watch half a folder arrive before the
   * other half failed.
   */
  const {
    data: { folders, files },
    status,
    error,
    reload,
  } = useResource(
    async (signal) => {
      const [folders, files] = await Promise.all([
        getKbFolders(hereId, signal),
        getKbFiles(hereId, signal),
      ])
      return { folders, files }
    },
    { folders: [] as KbFolder[], files: [] as KbFile[] },
    [hereId],
  )
  const loading = status === 'loading'

  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'table'>('grid')

  const [uploading, setUploading] = useState<UploadStep | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const [newFolder, setNewFolder] = useState(false)
  const [renaming, setRenaming] = useState<KbFolder | null>(null)
  const [moving, setMoving] = useState<KbFile | null>(null)
  const [removing, setRemoving] = useState<{ kind: 'file' | 'folder'; id: string; name: string } | null>(
    null,
  )
  const [folderName, setFolderName] = useState('')
  const [moveTarget, setMoveTarget] = useState('')

  const filePicker = useRef<HTMLInputElement>(null)
  const folderPicker = useRef<HTMLInputElement>(null)


  /**
   * A document is not usable the moment it lands.
   *
   * The platform answers an upload with a `pending` row and indexes it after,
   * so the page keeps asking while anything here is still pending. It stops on
   * its own the moment nothing is — an idle knowledge base polls nothing.
   */
  const pending = files.some((f) => f.status === 'pending')
  useEffect(() => {
    if (!pending) return
    const timer = setInterval(reload, INDEXING_POLL_MS)
    return () => clearInterval(timer)
  }, [pending, reload])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inFolders = q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders
    const inFiles = q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files
    return [
      ...inFolders.map((f) => ({ kind: 'folder' as const, folder: f, file: null })),
      ...inFiles.map((f) => ({ kind: 'file' as const, folder: null, file: f })),
    ]
  }, [folders, files, query])

  const pager = usePagination(matches, {
    sizes: PAGE_SIZES,
    resetKey: `${hereId ?? 'root'}|${query}`,
  })

  const refresh = reload

  async function send(picked: FileList | null) {
    if (!picked?.length) return
    setNotice(null)
    const list = Array.from(picked)
    try {
      const result = await uploadAll(list, hereId, setUploading)
      const ok = result.uploaded.length
      setNotice(
        result.failed.length
          ? {
              tone: 'bad',
              text: `${ok} uploaded, ${result.failed.length} failed — ${result.failed[0]?.reason ?? ''}`,
            }
          : { tone: 'ok', text: `${ok} document${ok === 1 ? '' : 's'} uploaded, indexing now.` },
      )
    } catch (err) {
      setNotice({ tone: 'bad', text: (err as Error).message })
    } finally {
      setUploading(null)
      refresh()
    }
  }

  async function act<T>(run: () => Promise<T>, done: string) {
    setNotice(null)
    try {
      await run()
      setNotice({ tone: 'ok', text: done })
      refresh()
    } catch (err) {
      setNotice({ tone: 'bad', text: (err as Error).message })
    }
  }

  const open = (folder: KbFolder) => setTrail((t) => [...t, folder])
  const upTo = (index: number) => setTrail((t) => t.slice(0, index))

  const columns: Column<(typeof matches)[number]>[] = [
    {
      key: 'name',
      header: 'Name',
      /**
       * A width of its own, and pinned.
       *
       * table-fixed shares out what the sized columns leave, and on a phone
       * they leave nothing — the name collapsed to a sliver and the table
       * opened on the Status column, showing a list of documents with no
       * document names in it.
       */
      width: 220,
      sticky: true,
      render: (row) =>
        row.kind === 'folder' ? (
          <button
            type="button"
            onClick={() => open(row.folder!)}
            className="inline-flex min-w-0 items-center gap-2 text-left hover:text-brand"
          >
            <IconFolder size={15} className="shrink-0 text-brand" />
            <span className="truncate font-medium">{row.folder!.name}</span>
          </button>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-2.5">
            <FileTypeIcon file={row.file!} size="sm" />
            <span className="truncate">{row.file!.name}</span>
          </span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 110,
      // A folder has no indexing state of its own; the dash says so, where an
      // empty cell reads as data that failed to arrive.
      render: (row) => (row.kind === 'file' ? <StatusChip status={row.file!.status} /> : '—'),
    },
    {
      key: 'size',
      header: 'Size',
      width: 90,
      align: 'right',
      render: (row) => (row.kind === 'file' ? fileSize(row.file!.file_size) : '—'),
    },
    {
      key: 'added',
      header: 'Added',
      width: 130,
      render: (row) => (
        <span title={dateTime(row.kind === 'folder' ? row.folder!.created_at : row.file!.created_at)}>
          {timeAgo(row.kind === 'folder' ? row.folder!.created_at : row.file!.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      width: 150,
      align: 'right',
      render: (row) =>
        row.kind === 'folder' ? (
          <span className="flex justify-end gap-1.5">
            <RowAction
              label="Rename"
              onClick={() => {
                setRenaming(row.folder!)
                setFolderName(row.folder!.name)
              }}
            />
            <RowAction
              label="Delete"
              danger
              onClick={() => setRemoving({ kind: 'folder', id: row.folder!.id, name: row.folder!.name })}
            />
          </span>
        ) : (
          <span className="flex justify-end gap-1.5">
            <RowAction
              label="Move"
              onClick={() => {
                setMoving(row.file!)
                setMoveTarget('')
              }}
            />
            <RowAction
              label="Delete"
              danger
              onClick={() => setRemoving({ kind: 'file', id: row.file!.id, name: row.file!.name })}
            />
          </span>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="What this workspace answers from. Upload files or a whole folder."
        onOpenDrawer={openDrawer}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setNewFolder(true)}>
              <IconFolderPlus size={14} />
              New folder
            </Button>
            <Button variant="ghost" size="sm" onClick={() => folderPicker.current?.click()}>
              <IconFolder size={14} />
              Upload folder
            </Button>
            <Button size="sm" onClick={() => filePicker.current?.click()}>
              <IconUpload size={14} />
              Upload files
            </Button>
          </div>
        }
      />

      {/* Two pickers, because a browser will offer files or a directory, never both. */}
      <input
        ref={filePicker}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          void send(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={folderPicker}
        type="file"
        multiple
        className="hidden"
        // Not in the React types, and the only way to pick a directory.
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => {
          void send(e.target.files)
          e.target.value = ''
        }}
      />

      <PageBody className="flex flex-col gap-4">
        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

        {uploading && (
          <div className="flex items-center gap-2.5 rounded-card border border-line bg-surface px-4 py-3 text-[12px] shadow-card">
            <Spinner size={13} />
            <span className="min-w-0 flex-1 truncate">
              Uploading {uploading.name || '…'}{' '}
              <span className="text-ink-3">
                ({uploading.done} of {uploading.total})
              </span>
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Breadcrumb trail={trail} onUp={upTo} />
          <div className="ml-auto flex items-center gap-2">
            <SearchInput
              label="Search documents and folders in this folder"
              placeholder="Search this folder"
              value={query}
              onChange={setQuery}
              className="w-full sm:w-56"
            />
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>

        {view === 'table' ? (
          <DataTable
            columns={columns}
            rows={pager.rows}
            rowKey={(row) => (row.kind === 'folder' ? row.folder!.id : row.file!.id)}
            loading={loading}
            error={error}
            onRetry={refresh}
            empty={<Empty query={query} onUpload={() => filePicker.current?.click()} />}
            footer={<TablePager pager={pager} noun="items" loading={loading} />}
          />
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Spinner size={18} />
          </div>
        ) : error ? (
          <DataBanner status="error" error={error} onRetry={refresh} />
        ) : pager.rows.length === 0 ? (
          <Empty query={query} onUpload={() => filePicker.current?.click()} />
        ) : (
          <>
            {/* No box around it: the page already scrolls, and a second
                scroller inside one is how a grid ends up with its own tiny
                window in the middle of an empty screen. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pager.rows.map((row) =>
                row.kind === 'folder' ? (
                  <FolderCard key={row.folder!.id} folder={row.folder!} onOpen={() => open(row.folder!)} />
                ) : (
                  <FileCard
                    key={row.file!.id}
                    file={row.file!}
                    onDelete={() =>
                      setRemoving({ kind: 'file', id: row.file!.id, name: row.file!.name })
                    }
                    onMove={() => {
                      setMoving(row.file!)
                      setMoveTarget('')
                    }}
                  />
                ),
              )}
            </div>

            {/* Its own line under the grid rather than a bar bolted to a box. */}
            <TablePager pager={pager} noun="items" loading={loading} className="pt-1" />
          </>
        )}
      </PageBody>

      <Modal
        open={newFolder}
        title="New folder"
        onClose={() => setNewFolder(false)}
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setNewFolder(false)}>
              Cancel
            </Button>
            <Button
              size="md"
              disabled={!folderName.trim()}
              onClick={() => {
                const name = folderName.trim()
                setNewFolder(false)
                setFolderName('')
                void act(() => createKbFolder(name, hereId), `Folder “${name}” created.`)
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <FolderNameField value={folderName} onChange={setFolderName} />
      </Modal>

      <Modal
        open={Boolean(renaming)}
        title="Rename folder"
        onClose={() => setRenaming(null)}
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              size="md"
              disabled={!folderName.trim()}
              onClick={() => {
                const folder = renaming!
                const name = folderName.trim()
                setRenaming(null)
                void act(() => renameKbFolder(folder.id, name), `Renamed to “${name}”.`)
              }}
            >
              Rename
            </Button>
          </>
        }
      >
        <FolderNameField value={folderName} onChange={setFolderName} />
      </Modal>

      <Modal
        open={Boolean(moving)}
        title={`Move “${moving?.name ?? ''}”`}
        onClose={() => setMoving(null)}
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button
              size="md"
              onClick={() => {
                const file = moving!
                const target = moveTarget || null
                setMoving(null)
                void act(() => moveKbFile(file.id, target), 'Document moved.')
              }}
            >
              Move
            </Button>
          </>
        }
      >
        <Select
          label="Destination"
          value={moveTarget}
          onChange={setMoveTarget}
          options={[
            { value: '', label: 'Root' },
            ...folders.map((f) => ({ value: f.id, label: f.name })),
          ]}
        />
        <p className="mt-2 text-[11.5px] text-ink-3">
          Folders inside the one you are looking at, plus the root.
        </p>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        title={removing?.kind === 'folder' ? 'Delete folder' : 'Delete document'}
        body={
          removing?.kind === 'folder'
            ? `“${removing.name}” will be deleted. A folder can only be deleted once it is empty.`
            : `“${removing?.name}” will be deleted, along with everything the workspace indexed from it. Agents will stop answering from it.`
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => {
          const target = removing!
          setRemoving(null)
          void act(
            () => (target.kind === 'folder' ? deleteKbFolder(target.id) : deleteKbFile(target.id)),
            `“${target.name}” deleted.`,
          )
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}

/**
 * What an upload or a delete just did.
 *
 * Not DataBanner: that one speaks only for a load that failed, and this
 * has to be able to carry good news as well.
 */
function Notice({
  notice,
  onDismiss,
}: {
  notice: { tone: 'ok' | 'bad'; text: string }
  onDismiss: () => void
}) {
  return (
    <div
      role={notice.tone === 'bad' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-card border px-4 py-3 text-[12px]',
        notice.tone === 'bad'
          ? 'border-danger/25 bg-danger-bg text-ink-2'
          : 'border-ok/25 bg-ok-bg text-ink-2',
      )}
    >
      <span className="min-w-0 flex-1">{notice.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 text-ink-3 hover:text-ink"
      >
        <IconX size={12} />
      </button>
    </div>
  )
}

/** A word-sized button, for the actions at the end of a row. */
function RowAction({
  label,
  onClick,
  danger = false,
}: {
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-1.5 py-0.5 text-[11.5px] font-medium transition-colors',
        danger ? 'text-ink-3 hover:text-danger' : 'text-ink-3 hover:text-brand',
      )}
    >
      {label}
    </button>
  )
}

/** Where you are, and the way back out. */
function Breadcrumb({ trail, onUp }: { trail: KbFolder[]; onUp: (index: number) => void }) {
  return (
    <nav aria-label="Folder" className="flex min-w-0 items-center gap-1 text-[12px]">
      <button
        type="button"
        onClick={() => onUp(0)}
        className={cn('rounded px-1.5 py-0.5', trail.length ? 'text-brand hover:bg-brand-soft' : 'text-ink-2')}
      >
        All documents
      </button>
      {trail.map((folder, i) => (
        <span key={folder.id} className="flex min-w-0 items-center gap-1">
          <IconChevronRight size={12} className="shrink-0 text-ink-4" />
          <button
            type="button"
            onClick={() => onUp(i + 1)}
            className={cn(
              'max-w-[10rem] truncate rounded px-1.5 py-0.5',
              i === trail.length - 1 ? 'font-medium text-ink' : 'text-brand hover:bg-brand-soft',
            )}
          >
            {folder.name}
          </button>
        </span>
      ))}
    </nav>
  )
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'grid' | 'table'
  onChange: (v: 'grid' | 'table') => void
}) {
  return (
    <div className="flex items-center rounded-full border border-line p-0.5" role="group" aria-label="View">
      {(
        [
          { id: 'grid' as const, icon: IconGrid, label: 'Grid' },
          { id: 'table' as const, icon: IconRows, label: 'Table' },
        ]
      ).map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-pressed={view === id}
          onClick={() => onChange(id)}
          className={cn(
            'inline-flex h-6 w-7 items-center justify-center rounded-full transition-colors',
            view === id ? 'bg-brand text-on-accent' : 'text-ink-3 hover:text-ink',
          )}
        >
          <Icon size={13} />
        </button>
      ))}
    </div>
  )
}

/** `pending` is the one worth watching; the platform indexes after it answers. */
/**
 * Whether a document is usable yet.
 *
 * The platform's documentation says a file is `pending` and then `indexed`.
 * A live workspace says `active`. Both are the same thing to whoever is
 * reading this page — the document is in and answers can come from it — so
 * both get one word, and it is the plain one rather than either of theirs.
 *
 * Anything unrecognised is shown as it arrived rather than hidden: a status
 * this does not know about is worth seeing, not worth swallowing.
 */
function StatusChip({ status }: { status: string }) {
  if (status === 'indexed' || status === 'active') return <Badge tone="ok">Ready</Badge>
  if (status === 'failed') return <Badge tone="danger">Failed</Badge>
  if (status === 'deleted') return <Badge>Deleted</Badge>
  if (status === 'pending')
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
        <Spinner size={10} />
        Indexing
      </span>
    )
  return <Badge>{status ? status[0]!.toUpperCase() + status.slice(1) : 'Unknown'}</Badge>
}

/**
 * What a document is, said in a few letters.
 *
 * The name decides it, and the mime type only answers when the name has
 * nothing to say. That order matters: the platform sends `text/plain` for
 * .md, .txt and .csv alike, so trusting it first labels a README as TXT.
 */
const KINDS: { ext: RegExp; mime: RegExp; label: string; tint: string }[] = [
  { ext: /^pdf$/i, mime: /pdf/i, label: 'PDF', tint: 'bg-danger-bg text-danger' },
  { ext: /^xlsx?$/i, mime: /spreadsheet|excel/i, label: 'XLS', tint: 'bg-ok-bg text-ok' },
  { ext: /^csv$/i, mime: /csv/i, label: 'CSV', tint: 'bg-ok-bg text-ok' },
  {
    ext: /^docx?$/i,
    mime: /wordprocessing|msword/i,
    label: 'DOC',
    tint: 'bg-brand-soft text-brand',
  },
  { ext: /^(md|markdown)$/i, mime: /markdown/i, label: 'MD', tint: 'bg-warn-bg text-warn' },
  { ext: /^pptx?$/i, mime: /presentation/i, label: 'PPT', tint: 'bg-warn-bg text-warn' },
  { ext: /^(txt|rtf)$/i, mime: /^text\/plain$/i, label: 'TXT', tint: 'bg-muted-bg text-ink-3' },
  {
    ext: /^(json|ya?ml|xml)$/i,
    mime: /json|xml|yaml/i,
    label: 'DATA',
    tint: 'bg-muted-bg text-ink-3',
  },
]

function kindOf(file: KbFile): { label: string; tint: string } {
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(file.name)?.[1] ?? ''
  const mime = file.mime_type ?? ''

  const hit =
    (ext ? KINDS.find((k) => k.ext.test(ext)) : undefined) ??
    (mime ? KINDS.find((k) => k.mime.test(mime)) : undefined)
  if (hit) return { label: hit.label, tint: hit.tint }

  // Anything else wears its own extension, which tells the reader more than
  // one more grey page icon would.
  return {
    label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE',
    tint: 'bg-muted-bg text-ink-3',
  }
}
/** A page corner, tinted by what the document is. */
function FileTypeIcon({ file, size = 'lg' }: { file: KbFile; size?: 'sm' | 'lg' }) {
  const { label, tint } = kindOf(file)
  const small = size === 'sm'
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-tight',
        small ? 'h-6 w-6 text-[8px]' : 'h-11 w-11 text-[10px]',
        tint,
      )}
    >
      {label}
    </span>
  )
}

function FolderCard({ folder, onOpen }: { folder: KbFolder; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 text-left shadow-card transition-all hover:border-brand-line hover:shadow-raised"
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
        <IconFolder size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium" title={folder.name}>
          {folder.name}
        </span>
        <span className="mt-0.5 block text-[11px] text-ink-3">Folder</span>
      </span>
      <IconChevronRight size={14} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

/**
 * One document.
 *
 * Flat on purpose: the type, the name, what it weighs and whether it is
 * ready, in one card with nothing boxed inside it. Actions stay out of the
 * way until the card is under the pointer, and are always reachable from a
 * keyboard.
 */
function FileCard({
  file,
  onDelete,
  onMove,
}: {
  file: KbFile
  onDelete: () => void
  onMove: () => void
}) {
  return (
    <div className="group relative flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-3.5 shadow-card transition-shadow hover:shadow-raised">
      <FileTypeIcon file={file} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-3">
          {fileSize(file.file_size)} · {timeAgo(file.created_at)}
        </p>
        <div className="mt-2">
          <StatusChip status={file.status} />
        </div>
      </div>

      {/*
        Lifted out of the flow. Kept in it, two buttons reserved their width
        on every card whether or not anyone was pointing at one, and every
        name was truncated to pay for them.
      */}
      <div className="absolute top-3 right-3 flex gap-0.5 rounded-md bg-surface opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton label={`Move ${file.name}`} onClick={onMove}>
          <IconFolder size={13} />
        </IconButton>
        <IconButton label={`Delete ${file.name}`} danger onClick={onDelete}>
          <IconX size={13} />
        </IconButton>
      </div>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded text-ink-4 transition-colors',
        danger ? 'hover:bg-danger-bg hover:text-danger' : 'hover:bg-sunken hover:text-ink-2',
      )}
    >
      {children}
    </button>
  )
}

function FolderNameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-medium text-ink-2">Name</span>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Handbook"
        className="h-9 w-full rounded-input border border-line bg-surface px-3 text-[13px] outline-none focus:border-brand"
      />
    </label>
  )
}

function Empty({ query, onUpload }: { query: string; onUpload: () => void }) {
  return (
    <EmptyState
      icon={IconFile}
      title={query ? 'Nothing matches that' : 'No documents here yet'}
      note={
        query
          ? 'Try a different search, or clear it to see everything in this folder.'
          : 'Upload a file or a whole folder, and this workspace will answer from it.'
      }
      action={
        query ? undefined : (
          <Button size="sm" onClick={onUpload}>
            <IconUpload size={14} />
            Upload files
          </Button>
        )
      }
    />
  )
}
