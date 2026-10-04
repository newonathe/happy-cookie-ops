import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier/flat';

const config = [
  ...nextVitals,
  ...nextTypescript,
  { rules: jsxA11y.flatConfigs.recommended.rules },
  prettier,
  {
    // Exact reviewed literal apostrophes; escaping would only change locked source spelling.
    files: [
      'src/components/screens/drops.tsx',
      'src/components/screens/shop.tsx',
      'src/components/sheets/proof.tsx'
    ],
    rules: { 'react/no-unescaped-entities': 'off' }
  },
  {
    // Preserve the existing sign-in image URL/loading behavior; no image-service integration in G0.
    files: ['src/app/sign-in/sign-in-form.tsx'],
    rules: { '@next/next/no-img-element': 'off' }
  },
  {
    // The ported engine is a verbatim copy of the prototype's logic (docs/PORTING.md).
    // It is linted for correctness by its tests, not by style rules it predates.
    ignores: [
      'src/store/engine/ops-engine.js',
      '.next/**',
      'build/**',
      'spikes/cleanup-worker/build/**',
      'spikes/workers-web/build/**',
      '**/.wrangler/**',
      'out/**',
      'coverage/**',
      'storybook-static/**',
      'playwright-report/**',
      'test-results/**',
      'public/sw.js',
      'docs/**',
      'scripts/**'
    ]
  },
  {
    files: [
      'src/components/screens/**/*.tsx',
      'src/components/sheets/**/*.tsx',
      'src/components/shell/**/*.tsx'
    ],
    rules: {
      // Ported markup: the prototype's own <img> tags and inline styles are the spec.
      '@next/next/no-img-element': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/click-events-have-key-events': 'off'
    }
  }
];

export default config;
