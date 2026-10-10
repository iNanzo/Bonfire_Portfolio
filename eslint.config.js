// Lint rules for the whole repo (`npm run lint`): ESLint's recommended set, with the
// globals each part runs under. CI runs it before tests and the build.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/',
      'admin/dist/',
      'node_modules/',
      'public/',
      'coverage/',
      '.scratch/',
      // (This machine's Claude Code skills and settings: local, git-ignored, never in CI.)
      '.claude/',
      'review/',
      'test-results/',
      'playwright-report/',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      // Mistakes: a `let` nothing reassigns, a loose `==` (except `== null`, which means
      // null or undefined on purpose), a function-scoped `var`. A destructuring `let` is fine
      // while any one of its names is reassigned.
      'prefer-const': ['error', { destructuring: 'all' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      // Size and shape: warnings that point at what to split next, never a failed build.
      'no-shadow': 'warn',
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 25],
      'max-depth': ['warn', 4],
    },
  },
  // The settings map is one table (every setting's label, hint, place and range, for Bonfire
  // Live, the Painter and the admin); splitting it would only add imports between its halves.
  {
    files: ['src/settingsMap.js'],
    rules: { 'max-lines': 'off' },
  },
  // Node: tests, build tools and config.
  {
    files: ['test/**', 'admin/test/**', 'e2e/**', 'tools/**', '*.config.js', '*.config.mjs', 'admin/vite.config.js'],
    languageOptions: { globals: globals.node },
  },
  // The admin's Cloudflare Worker.
  {
    files: ['admin/worker.js', 'admin/server/**'],
    languageOptions: { globals: globals.serviceworker },
  },
];
