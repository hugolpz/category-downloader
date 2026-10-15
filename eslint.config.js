import js from '@eslint/js';
import globals from 'globals';
import vue from 'eslint-plugin-vue';

export default [
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Catches typos and forgotten variables, the main safety the type checker used to provide.
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'vue/multi-word-component-names': 'off',
    },
  },
  // Vue's compiler macros are globals inside <script setup>.
  { files: ['**/*.vue'], languageOptions: { globals: { defineProps: 'readonly', defineEmits: 'readonly' } } },
];
