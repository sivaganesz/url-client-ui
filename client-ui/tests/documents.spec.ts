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
})
