// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['apps/server/**/*.ts', 'e2e/**/*.ts', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // CLAUDE.md rule #1: the engine is pure. Time and randomness are injected.
    files: ['apps/server/src/engine/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'setTimeout', message: 'The engine is pure: no timers.' },
        { name: 'setInterval', message: 'The engine is pure: no timers.' },
        { name: 'setImmediate', message: 'The engine is pure: no timers.' },
        { name: 'process', message: 'The engine is pure: no I/O.' },
        { name: 'fetch', message: 'The engine is pure: no I/O.' },
        { name: 'console', message: 'The engine is pure: no I/O.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'The engine is pure: inject `now` instead of calling Date.now().',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'The engine is pure: inject `now` instead of new Date().',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'The engine is pure: inject a random source instead of Math.random().',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*', 'fs', 'path', 'http', 'crypto'], message: 'The engine is pure: no I/O.' },
            { group: ['socket.io', '@anthropic-ai/*'], message: 'The engine is pure: no I/O.' },
            { group: ['../rooms/*', '../socket/*', '../ai/*'], message: 'The engine must not depend on outer layers.' },
          ],
        },
      ],
    },
  },
);
