import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  /* ------------------------------------------------------------------ */
  /* Шляхи, які ESLint не перевіряє                                      */
  /* ------------------------------------------------------------------ */
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '.husky/**'],
  },

  /* ------------------------------------------------------------------ */
  /* Базові правила ESLint для JavaScript-файлів (*.js, *.mjs, *.cjs)    */
  /* ------------------------------------------------------------------ */
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  /* ------------------------------------------------------------------ */
  /* TypeScript: перевірка з урахуванням типів (type-aware linting)      */
  /* ------------------------------------------------------------------ */
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
      parserOptions: {
        // автоматично знаходить tsconfig.json для кожного файлу
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // node:test сам керує виконанням тестів — проміси з describe/it await'ити не потрібно
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it'] },
          ],
        },
      ],
      '@typescript-eslint/no-misused-promises': 'error',

      'no-console': 'warn',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
      curly: ['error', 'multi-line'],
      'object-shorthand': ['error', 'always'],
    },
  },

  /* ------------------------------------------------------------------ */
  /* Вимкнення правил, що конфліктують з Prettier. МАЄ БУТИ ОСТАННІМ!     */
  /* ------------------------------------------------------------------ */
  prettierConfig,
);
