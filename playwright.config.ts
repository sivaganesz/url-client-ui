import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE } from './tests/paths'

/**
 * Regression suite for the console.
 *
 * These are integration tests, not unit tests: they drive a real browser
 * against the real workspace API through the proxy. That is deliberate —
 * almost everything that has broken in this project broke at the seam between
 * the UI and the API, and a mocked suite would have caught none of it.
 *
 * The cost of that choice is that the data is not fixed. Assertions therefore
 * check invariants ("filtering never grows the list") rather than figures
 * ("41 rows"), because a suite that fails when somebody adds a conversation
 * teaches people to ignore it.
 *
 * NOTHING HERE SENDS. No test places a call, sends a message, or publishes an
 * agent. The outbound paths are covered up to the confirmation step and no
 * further — see tests/README.md.
 */
export default defineConfig({
  testDir: './tests',
  // One worker: the tests share one live workspace, and the agent activate /
  // deactivate flows would race each other across parallel workers.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://localhost:5180',
    // A failing run should say why without needing to be reproduced by hand.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    // Signs in once and saves the cookie; the others reuse it. argon2 is
    // deliberately slow to verify, so doing this per test would dominate the
    // run.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
      testIgnore: /responsive\.spec\.ts|auth\.setup\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
      testMatch: /responsive\.spec\.ts/,
    },
  ],

  /**
   * Both servers, started by the suite.
   *
   * The backend holds each workspace's API key; Vite forwards /api to it.
   * Starting them here means `npm test` works from a clean checkout rather
   * than silently testing whatever happened to be running on those ports.
   *
   * The backend needs a database and a seeded account — see ../backend.
   */
  webServer: [
    {
      // The backend holds the workspace credentials and serves /api. It is a
      // sibling project now, not part of this one.
      command: 'npm start',
      cwd: '../backend',
      url: 'http://localhost:4400/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npx vite',
      url: 'http://localhost:5180',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
})
