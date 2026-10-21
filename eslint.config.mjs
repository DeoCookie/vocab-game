// ESLint flat config. Self-contained (no plugin packages) so linting works offline.

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  HTMLElement: 'readonly',
  HTMLButtonElement: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLSelectElement: 'readonly',
  HTMLTextAreaElement: 'readonly',
  Node: 'readonly',
  URL: 'readonly'
};

const nodeGlobals = {
  require: 'readonly',
  module: 'writable',
  __dirname: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  setImmediate: 'readonly',
  setTimeout: 'readonly',
  URL: 'readonly',
  Response: 'readonly'
};

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-proto': 'error',
  'no-prototype-builtins': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'always'],
  'no-restricted-properties': [
    'error',
    { property: 'innerHTML', message: 'Use textContent or the el() helper.' },
    { property: 'outerHTML', message: 'Use textContent or the el() helper.' },
    { property: 'insertAdjacentHTML', message: 'Use the el() helper.' }
  ]
};

export default [
  { ignores: ['node_modules/**', 'dist/**', 'out/**', 'coverage/**'] },
  {
    files: ['src/main/**/*.js', 'src/preload/**/*.js', 'test/**/*.test.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: nodeGlobals },
    rules
  },
  {
    files: ['src/renderer/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browserGlobals },
    rules
  },
  {
    files: ['test/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...nodeGlobals, ...browserGlobals } },
    rules: { ...rules, 'no-restricted-properties': 'off' }
  }
];
