// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/.turbo/**', '**/.expo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // CLAUDE.md: colors only from design tokens. Raw hex/rgb allowed only inside the theme folder.
    files: ['apps/mobile/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/shared/ui/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^(#[0-9a-fA-F]{3,8}|rgba?\\(.*\\))$/]',
          message: 'Use color tokens from useTheme() instead of hard-coded colors.',
        },
      ],
    },
  },
  {
    // typescript-eslint 8.73: this rule overflows the stack on React Native's recursive Animated types
    // (RangeError, not a finding). All Animated code lives in this folder, so the rule is off only here.
    files: ['apps/mobile/src/shared/ui/motion/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-unsafe-class-instance-assignment': 'off' },
  },
  prettier,
);
