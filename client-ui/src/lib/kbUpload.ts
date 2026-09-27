import { createKbFolder, getKbFolders, uploadKbFile, type KbFile, type KbFolder } from './api'

/**
 * Uploading documents, one at a time, folders and all.
 *
 * The platform takes one file per request and knows nothing about folders at
 * upload time — a document is placed by being given a `folder_id` that already
 * exists. A browser folder picker hands back a flat list of files carrying
 * `webkitRelativePath` ("handbook/hr/leave.pdf"), so recreating the shape the
 * person dragged in means reading those paths and making the folders first.
 *
 * Sequential on purpose. Two files from the same new folder, uploaded at once,
 * would each find no folder and each create one, and the workspace would end
 * up with two folders of the same name holding half the documents each.
 */

export interface UploadStep {
  /** What is being sent right now. */
  name: string
  done: number
  total: number
}

export interface UploadOutcome {
  uploaded: KbFile[]
  /** Folders made along the way, so the page can show them without refetching. */
  created: KbFolder[]
  failed: { name: string; reason: string }[]
}

/** The directory part of a picked file, relative to what was picked. */
function directoryOf(file: File): string[] {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''
  if (!relative) return []
  const parts = relative.split('/').filter(Boolean)
  // The last segment is the file itself.
  return parts.slice(0, -1)
}

export async function uploadAll(
  files: File[],
  parentId: string | null,
  onStep?: (step: UploadStep) => void,
): Promise<UploadOutcome> {
  const uploaded: KbFile[] = []
  const created: KbFolder[] = []
  const failed: { name: string; reason: string }[] = []

  /** Folder id by path, so a folder is looked up once however many files land in it. */
  const byPath = new Map<string, string | null>([['', parentId]])

  /**
   * The folder for a path, made if it is not there yet.
   *
   * Matched on name among that parent's own children rather than on the
   * platform's `path` string, whose format is not documented — a guess about
   * leading slashes would quietly create a second "handbook" beside the one
   * already there.
   */
  async function folderFor(segments: string[]): Promise<string | null> {
    let parent: string | null = parentId
    let walked = ''

    for (const segment of segments) {
      walked = walked ? `${walked}/${segment}` : segment
      const cached = byPath.get(walked)
      if (cached !== undefined) {
        parent = cached
        continue
      }

      const siblings = await getKbFolders(parent)
      const existing = siblings.find((f) => f.name === segment)
      const folder = existing ?? (await createKbFolder(segment, parent))
      if (!existing) created.push(folder)

      byPath.set(walked, folder.id)
      parent = folder.id
    }

    return parent
  }

  for (const [index, file] of files.entries()) {
    onStep?.({ name: file.name, done: index, total: files.length })
    try {
      const folderId = await folderFor(directoryOf(file))
      uploaded.push(await uploadKbFile(file, folderId))
    } catch (err) {
      // One document that will not upload should not take the rest of the
      // batch with it — the person picked forty files, not one.
      failed.push({ name: file.name, reason: (err as Error).message })
    }
  }

  onStep?.({ name: '', done: files.length, total: files.length })
  return { uploaded, created, failed }
}
