import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Companion to `npm run lint`, which is tsc. This catches what a typechecker
 * cannot: hook ordering, stale effect deps, unreachable accessibility.
 *
 * Errors are reserved for rules that flag a real defect, so `lint:eslint` can
 * gate. Everything advisory is a warning — `--max-warnings` is deliberately not
 * set, because the accessibility backlog predates this config and failing the
 * build on it would just mean the config gets removed again.
 *
 * Not type-aware (no `projectService`): the type-checked ruleset needs a full
 * program per file and takes minutes over 373 components. Revisit if the
 * non-typed rules stop earning their keep.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'build/**',
      'desktop/build/**',
      'coverage/**',
      'node_modules/**',
      'functions/lib/**',
      'plugins/**/dist/**',
      'units/**/target/**',
      'android/**',
      'ios/**',
      '**/*.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // tsc resolves identifiers, and does it with the real type graph. Leaving
      // this on just means ESLint re-reports the same thing worse: it produced
      // 454 hits here, every one of them a global it had not been told about.
      'no-undef': 'off',

      // Also tsc's, and its version understands the `_` prefix convention used
      // here for intentionally ignored arguments.
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',

      // ~122 explicit `any`s predate this config. Worth seeing, not worth
      // blocking on — the leaflet-draw and Firestore seams are genuinely untyped.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',

      // A silently swallowed error was a finding in the audit, so this blocks.
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },

  {
    // CommonJS by extension, plus the Electron and tooling scripts that predate
    // the ESM move.
    files: ['**/*.cjs', 'scripts/**/*.js', 'plugins/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,

      // A conditional hook is always a bug, so this one blocks.
      'react-hooks/rules-of-hooks': 'error',
      // Stale closures were the largest category in the audit, but enough of
      // these omissions are deliberate that it cannot block yet.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    // The accessibility backlog predates this config: ~100 findings, mostly
    // labels without a control association. Warnings so the list stays visible
    // and shrinkable; promote a rule to error once its count reaches zero.
    files: ['src/**/*.tsx'],
    rules: Object.fromEntries(
      Object.entries(jsxA11y.flatConfigs.recommended.rules)
        // Keep the ones recommended deliberately disables disabled. Mapping
        // every key to 'warn' switches them on, which is how the deprecated
        // label-has-for turned into 181 duplicates of label-has-associated-control.
        .filter(([, level]) => level !== 'off' && level !== 0)
        .map(([rule]) => [rule, 'warn'])
    ),
  },

  {
    /**
     * Leaflet has to be reached through `src/lib/leaflet-setup.ts`.
     *
     * `leaflet-draw` and `leaflet.markercluster` are plain scripts that read a
     * bare global `L` and never import leaflet themselves. `leaflet-window.ts`
     * is what assigns that global, and `leaflet-setup.ts` is what guarantees it
     * runs first. A module that imports `leaflet` directly and a plugin
     * alongside it works only for as long as the bundler happens to evaluate
     * them in a helpful order — and since `main.tsx` stopped importing the setup
     * module eagerly, that order is no longer anybody's guarantee. Getting it
     * wrong is `ReferenceError: L is not defined` and a white screen on /map.
     *
     * `import type` is unaffected: it is erased before anything runs.
     */
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/leaflet-window.ts', 'src/lib/leaflet-setup.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'leaflet',
              message:
                "Import `L` from 'src/lib/leaflet-setup' so the plugins and window.L are registered first. `import type ... from 'leaflet'` is fine.",
              allowTypeImports: true,
            },
            {
              name: 'leaflet-draw',
              message: "Already registered by 'src/lib/leaflet-setup'; import that instead.",
            },
            {
              name: 'leaflet.markercluster',
              message: "Already registered by 'src/lib/leaflet-setup'; import that instead.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.{ts,tsx}', '**/*.config.{ts,js}', 'tmp/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'off',
    },
  }
);
