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
