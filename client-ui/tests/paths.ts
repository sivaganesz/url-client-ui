/**
 * Shared constants, and nothing else.
 *
 * Its own module because playwright.config.ts needs this path too, and a
 * config file may not import anything that calls `test()` — importing the
 * setup file directly makes Playwright refuse to start.
 */

/** Where the signed-in cookie is saved for the other projects to reuse. */
export const STORAGE_STATE = 'tests/.auth/session.json'
