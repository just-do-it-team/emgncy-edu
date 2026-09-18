import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const layers = ['app', 'pages', 'widgets', 'features', 'entities', 'shared']
const fsdConfigs = layers.map((layer, index) => {
  // Within a slice, use relative imports; other slices must be on lower layers.
  const forbiddenLayers = layers.slice(0, index)
  if (layer !== 'app' && layer !== 'shared') forbiddenLayers.push(layer)

  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            regex: '^@/(pages|widgets|features|entities|shared)/[^/]+/',
            message: 'Import through the public API of the slice or Shared segment. Use relative imports within a slice.',
          },
          ...(forbiddenLayers.length ? [{
            regex: `^@/(${forbiddenLayers.join('|')})(/|$)`,
            message: 'FSD only allows importing other slices from lower layers. Use relative imports within a slice.',
          }] : []),
        ],
      }],
    },
  }
})

export default tseslint.config({
  extends: [js.configs.recommended, ...tseslint.configs.recommended],
  files: ['**/*.{ts,tsx}'],
  ignores: ['dist'],
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.browser,
  },
  plugins: {
    'react-hooks': reactHooks,
    'react-refresh': reactRefresh,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}, ...fsdConfigs)
