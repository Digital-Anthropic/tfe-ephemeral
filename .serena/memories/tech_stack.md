# Tech Stack

## Runtime

- **Node.js**: v24+ (specified in engines and .node-version)
- **Module System**: ES Modules (ESM) - `"type": "module"` in package.json

## Language

- **TypeScript** v5.9.3
  - Target: ES2022
  - Module: NodeNext
  - Strict mode enabled
  - Library: ES2022

## Build Tools

- **Rollup** v4.52.5 - Bundles TypeScript into a single distributable file
  - Plugins: @rollup/plugin-typescript, @rollup/plugin-node-resolve,
    @rollup/plugin-commonjs
  - Output: dist/index.js (ES module format)
  - Generates sourcemaps

## Testing

- **Jest** v30.2.0 with ts-jest
  - ESM support enabled via NODE_OPTIONS=--experimental-vm-modules
  - Coverage reporting (json-summary, text, lcov)
  - Mock support for ES modules using jest.unstable_mockModule

## Code Quality

- **ESLint** v9.38.0
  - TypeScript ESLint plugin
  - Import plugin
  - Jest plugin
  - Prettier integration
  - Using flat config format (eslint.config.mjs)
- **Prettier** v3.6.2
  - Single quotes
  - No semicolons
  - 2-space indentation
  - LF line endings
  - Print width: 80

## GitHub Actions

- **@actions/core** v1.11.1 - Core functionality for GitHub Actions
- **@github/local-action** v6.0.2 - Local testing utility

## Additional Tools

- **make-coverage-badge** - Generates coverage badges
- **Licensed** - Dependency license management (optional)
