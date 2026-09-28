// Lint rules for the whole repo (`npm run lint`): ESLint's recommended set, with the
// globals each part runs under. CI runs it before tests and the build.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'admin/dist/', 'node_modules/', 'public/', '.scratch/', 'review/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
  // Node: tests, build tools and config.
  {
    files: ['test/**', 'admin/test/**', 'tools/**', '*.config.js', 'admin/vite.config.js'],
    languageOptions: { globals: globals.node },
  },
  // The admin's Cloudflare Worker.
  {
    files: ['admin/worker.js', 'admin/server/**'],
    languageOptions: { globals: globals.serviceworker },
  },
];
