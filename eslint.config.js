/* eslint-disable */
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  
  // Base TypeScript config for Node.js files
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['supabase/functions/**/*.ts'], // Exclude Deno files
    languageOptions: {
      parser: tsParser,
      parserOptions: { 
        ecmaVersion: 2020, 
        sourceType: 'module' 
      },
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Buffer: 'readonly',
        global: 'writable',
        fetch: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },

  // Deno Edge Functions config
  {
    files: ['supabase/functions/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { 
        ecmaVersion: 2020, 
        sourceType: 'module' 
      },
      globals: {
        // Deno globals
        Deno: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
    },
  },

  // Jest test files config
  {
    files: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { 
        ecmaVersion: 2020, 
        sourceType: 'module' 
      },
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        global: 'writable',
        fetch: 'writable',
        Response: 'readonly',
        // Jest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off', // Allow any in tests
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_' }],
    },
  },
];
