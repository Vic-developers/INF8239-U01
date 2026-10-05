'use strict';

const base = require('./eslint.base.cjs');
const globals = require('globals');

/** React ruleset for apps/web and packages/ui. */
module.exports = [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2021 },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
];