import js from '@eslint/js';
import node from '@mcc/config/eslint.node.cjs';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  node,
  {
    rules: {
      // NestJS relies on constructor injection, so parameter properties are the
      // idiomatic form rather than a smell to suppress.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
