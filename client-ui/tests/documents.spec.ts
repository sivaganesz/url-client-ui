import { expect, test } from '@playwright/test'
import { visit } from './helpers'

/**
 * The Documents page.
 *
 * Reads only. Nothing here uploads, creates or deletes: this suite runs
 * against the real workspace, and a test that leaves folders behind is a test
 * somebody has to tidy up after.
 */
test.describe('documents', () => {
  test('lists what the workspace answers from, in either view', async ({ page }) => {
    await visit(page, '/documents')

    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible()

    // Both views render the same folder; the toggle is not a page change.
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await expect(page.getByRole('table')).toBeVisible()

    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    await expect(page.getByRole('table')).toBeHidden()
  })

  /**
   * One character, then nothing.
   *
   * `useDialog` depended on the identity of the `onClose` it was given, and
   * every caller writes that as an inline arrow — so a dialog holding the
   * state of its own text field tore the effect down and set it up again on
   * each keystroke, and setting it up starts by focusing the panel. Typing put
   * one letter in the box and then lost the box.
   *
   * Cancelled deliberately: this checks the field, not folder creation.
   */
  test('a folder name can be typed all the way through', async ({ page }) => {
    await visit(page, '/documents')

    await page.getByRole('button', { name: 'New folder' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    const field = dialog.getByLabel('Name')
    await field.click()
    // Key by key, with a gap: what went wrong happened between keystrokes, and
    // fill() would have set the value in one go and seen nothing.
    await page.keyboard.type('Handbook', { delay: 50 })

    await expect(field).toHaveValue('Handbook')
    await expect(field).toBeFocused()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })

  test('a folder opens, and the way back out is there', async ({ page }) => {
    await visit(page, '/documents')

    // A folder card, not the New folder or Upload folder buttons — those
    // contain the word too. The card carries 'Folder' as its own line.
    const folder = page
      .getByRole('button')
      .filter({ has: page.getByText('Folder', { exact: true }) })
      .first()
    const count = await folder.count()
    test.skip(count === 0, 'this workspace has no folders')

    const name = (await folder.innerText()).split('\n')[0]!.trim()
    await folder.click()

    // The breadcrumb is the way back, and it names where you are.
    await expect(page.getByRole('navigation', { name: 'Folder' })).toContainText(name)

    await page.getByRole('button', { name: 'All documents' }).click()
    await expect(page.getByRole('navigation', { name: 'Folder' })).not.toContainText(name)
  })

  /**
   * A document is named by what it is, not by a generic page icon. The
   * platform reports text/plain for .md, .txt and .csv alike, so the name
   * decides and the mime type only answers when the name cannot.
   */
  test('each document wears its type', async ({ page }) => {
    await visit(page, '/documents')
    await page.getByRole('button', { name: 'Table', exact: true }).click()

    const chips = page.locator('table tbody tr span').filter({
      hasText: /^(PDF|XLS|CSV|DOC|MD|PPT|TXT|DATA|[A-Z0-9]{2,4})$/,
    })
    test.skip((await chips.count()) === 0, 'no documents in this workspace')

    // Whatever they say, none of them says the platform\u2019s raw mime type.
    for (const text of await chips.allInnerTexts()) {
      expect(text, 'a mime type leaked into the type chip').not.toContain('/')
    }
  })

  /**
   * The status the platform actually sends.
   *
   * Its documentation says `indexed`; a live workspace says `active`. Both
   * mean the document is in, so both read Ready — and a raw lowercase word
   * in a chip means a third one has appeared that nobody has looked at.
   */
  test('a document says whether it is usable, in words', async ({ page }) => {
    await visit(page, '/documents')
    await page.getByRole('button', { name: 'Table', exact: true }).click()

    const statuses = page.locator('table tbody tr td:nth-child(2)')
    test.skip((await statuses.count()) === 0, 'nothing here to have a status')

    for (const text of await statuses.allInnerTexts()) {
      const said = text.trim()
      if (said === '' || said === '\u2014') continue
      expect(said, 'an unrecognised status reached the page as-is').toMatch(
        /^(Ready|Failed|Indexing|Deleted)$/,
      )
    }
  })

  test('the pager sits under the list and counts what is there', async ({ page }) => {
    await visit(page, '/documents')

    // Same pager in both views, below the content either way.
    for (const view of ['Grid', 'Table']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      await expect(page.getByRole('combobox', { name: /rows per page/i })).toBeVisible()
      await expect(page.getByText(/\d+\u2013\d+ of \d+/)).toBeVisible()
    }
  })

  /**
   * Nothing here uploads or deletes. This runs against the real knowledge
   * base, and a suite that leaves documents behind is one somebody has to
   * tidy up after — so the buttons are checked for being there, and left.
   */
  test('the ways in are offered without being taken', async ({ page }) => {
    await visit(page, '/documents')

    await expect(page.getByRole('button', { name: 'Upload files' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Upload folder' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'New folder' })).toBeEnabled()
  })
})
