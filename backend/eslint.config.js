import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * The backend is all Node, all TypeScript, so this is one block rather than
 * the frontend's three.
 *
 * Type errors are tsc's job (`npm run typecheck`). What ESLint is here for is
 * scope and unused code — the class of mistake that a bundler or a type
 * stripper will happily carry into production, because an unknown identifier
 * only fails when the line runs.
 */
export default [
  { ignores: ['node_modules/**'] },

  {
    files: ['**/*.ts'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
      parser: tseslint.parser,
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      ...js.configs.recommended.rules,

      /**
       * The TS-aware versions, for the same reason as the frontend: the base
       * rules read type positions as value positions, so a parameter named in
       * an interface looks unused, and TS's own globals look undefined. These
       * are not rules switched off to go quiet — tsc checks undefined names
       * against the real lib types, which is stricter than a name list.
       */
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      'no-undef': 'off',

      /**
       * Not enabled: `@typescript-eslint/no-floating-promises`, which would
       * have caught the boot-time session sweep taking the process down with
       * an unhandled rejection. It needs type-aware linting — a full program
       * built per run — and that is a bigger change than one rule. Worth
       * revisiting if a second promise gets dropped.
       */
    },
  },

  // discover.js is a plain-JS CLI, not part of the server.
  {
    files: ['discover.js'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: { ...js.configs.recommended.rules },
  },
]
