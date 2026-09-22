import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * Two environments in one repo: the app runs in a browser, the proxies run in
 * Node. They get different globals, which is why this isn't one flat block —
 * linting server code against browser globals lets a stray `window` through.
 *
 * `no-undef` is the rule that matters most here. Vite's build treats an unknown
 * identifier as a possible global and ships it, so an out-of-scope variable is
 * a blank page at runtime rather than a build failure. That has happened twice
 * in this project; this config is the guard against a third.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  // ── the app ──────────────────────────────────────────────
  // Type errors are tsc's job (`npm run typecheck`, and the build gate);
  // ESLint here is about scope, unused code and hook rules.
  {
    files: ['src/**/*.{ts,tsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
      // No type-aware rules: they need a program per run and cost more than
      // they return on a codebase this size. tsc already checks the types.
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // Fast Refresh only reliably swaps a module that exports components and
      // nothing else. A module exporting a constant alongside them still
      // works — it just reloads wholesale — so this is a warning, not an error.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Loop counters and caught errors are routinely unused on purpose.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],

      /**
       * react-hooks 7 ships the React Compiler rule set, which is stricter
       * than the classic rules-of-hooks pair. Two of its rules flag real
       * design issues here that are a refactor rather than a lint fix:
       *
       *   set-state-in-effect  — effects that reset paging on a filter change.
       *                          Correct today, but an extra render each time.
       *   use-memo             — hooks taking a variable dependency array,
       *                          which the rule cannot verify statically.
       *
       * Left on as warnings rather than switched off: they stay visible on
       * every run, and they are the audit's "unnecessary effects / re-renders"
       * items, to be fixed with the rest of that work. Everything else in the
       * set — refs, purity, immutability, rules-of-hooks — is an error.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/use-memo': 'warn',
    },
  },

  /**
   * TypeScript-aware replacements for two base rules.
   *
   * The base rules read type positions as value positions, so a parameter
   * named in an `interface` signature looks unused and TS's own globals —
   * `RequestInit`, `HTMLAudioElement` — look undefined. These are not rules
   * being switched off to go quiet: the TS-aware versions check the same
   * things correctly, and `tsc --noEmit` checks undefined names against the
   * real lib types, which is strictly better than a name list.
   */
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-undef': 'off',
    },
  },

  // ── the proxies ──────────────────────────────────────────
  {
    files: ['server/**/*.js', 'api/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
]
