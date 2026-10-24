import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
  js.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node, ecmaVersion: 2024 },
    rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }] } },
];
