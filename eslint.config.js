import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/blob-report/**',
      // Generated: Allure's report is a bundled web app, and its results are
      // machine-written JSON. Neither is ours to lint.
      '**/allure-report/**',
      '**/allure-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Playwright's fixture signature requires `async ({}, use) => …` when a
    // fixture depends on nothing — the empty pattern is the framework's idiom,
    // not an oversight.
    files: ['**/fixtures/**/*.ts', '**/fixtures.ts'],
    rules: {
      'no-empty-pattern': 'off',
    },
  },
)
