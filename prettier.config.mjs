/** @type {import('prettier').Config} */
const config = {
  singleQuote: true,
  semi: true,
  printWidth: 100,
  trailingComma: 'none',
  arrowParens: 'always',
  overrides: [{ files: 'src/store/engine/ops-engine.js', options: { requirePragma: true } }]
};

export default config;
