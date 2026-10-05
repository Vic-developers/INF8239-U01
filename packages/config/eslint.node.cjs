'use strict';

const base = require('./eslint.base.cjs');

/** Node-side ruleset: allows process/console in tooling scripts, forbids unused code. */
module.exports = [
  ...base,
  {
    rules: {
      'no-console': 'off',
      'no-process-exit': 'off',
    },
  },
];