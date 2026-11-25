import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(js.configs.recommended, ...ts.configs.recommended, {
  files: ['**/*.{ts,mjs}'],
  languageOptions: {
    globals: {
      chrome: 'readonly',
      window: 'readonly',
      document: 'readonly',
      console: 'readonly',
      setTimeout: 'readonly',
      clearTimeout: 'readonly',
      URL: 'readonly',
      Blob: 'readonly',
      TextDecoder: 'readonly',
      indexedDB: 'readonly',
      crypto: 'readonly',
      structuredClone: 'readonly',
      DOMParser: 'readonly',
      performance: 'readonly',
      location: 'readonly',
      HTMLAnchorElement: 'readonly',
      HTMLElement: 'readonly',
      MutationObserver: 'readonly',
      Node: 'readonly',
      process: 'readonly',
    },
  },
});
