import eslintRecommended from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  eslintRecommended.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
      },
    },
    rules: {
      ...eslintConfigPrettier.rules,
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: 'error',
      'no-console': 'warn',
      'no-unused-vars': 'warn',
    },
    ignores: [
      'node_modules/', 
      'dist/',  
      'build/',  
      '.git/',
      '**/*.test.js',
      '**/*.spec.js',
      'coverage/',  
      'public/',
      '.vscode/',
    ],
  },
];
