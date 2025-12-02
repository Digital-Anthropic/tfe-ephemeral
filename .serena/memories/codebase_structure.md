# Codebase Structure

## Directory Layout

```
tfe-ephemeral/
├── .github/
│   └── workflows/          # GitHub Actions CI/CD workflows
│       ├── ci.yml          # Main CI workflow (test, lint, format)
│       ├── check-dist.yml  # Verifies dist/ is up to date
│       ├── linter.yml      # Linting workflow
│       ├── codeql-analysis.yml  # Security analysis
│       └── licensed.yml    # Dependency license checking (disabled by default)
│
├── src/                    # Source code (TypeScript)
│   ├── index.ts           # Entry point - imports and executes main
│   ├── main.ts            # Main action logic with run() function
│   └── wait.ts            # Helper function (example)
│
├── __tests__/             # Test files
│   ├── main.test.ts       # Tests for main.ts
│   └── wait.test.ts       # Tests for wait.ts
│
├── __fixtures__/          # Test fixtures and mocks
│   ├── core.ts           # Mock for @actions/core module
│   └── wait.ts           # Mock for wait function
│
├── dist/                  # Bundled output (generated, must be committed!)
│   ├── index.js          # Bundled ES module (this is what runs in GitHub Actions)
│   └── index.js.map      # Source map
│
├── script/               # Helper scripts
│   └── release           # Release automation script
│
├── badges/               # Generated badges
│   └── coverage.svg      # Coverage badge
│
├── .vscode/              # VS Code configuration
│   └── launch.json       # Debugger configuration for local-action
│
├── .devcontainer/        # Dev container configuration
│
├── action.yml            # GitHub Action metadata (inputs, outputs, branding)
├── package.json          # npm package configuration and scripts
├── tsconfig.json         # TypeScript compiler configuration
├── eslint.config.mjs     # ESLint configuration (flat config)
├── jest.config.js        # Jest test configuration
├── rollup.config.ts      # Rollup bundler configuration
├── .prettierrc.yml       # Prettier formatting configuration
├── .prettierignore       # Files to ignore for Prettier
├── .env.example          # Example environment variables for local testing
├── .node-version         # Specifies Node.js version (24.x)
└── README.md             # Documentation
```

## Key Files Explained

### Action Definition

- **action.yml**: Defines the action's metadata
  - Name, description, author
  - Inputs (with defaults and descriptions)
  - Outputs
  - Runtime (node24)
  - Entry point (dist/index.js)

### Source Code Flow

1. **src/index.ts**: Entry point that imports and calls run()
2. **src/main.ts**: Contains the main run() function
   - Gets inputs from action.yml via core.getInput()
   - Performs action logic
   - Sets outputs via core.setOutput()
   - Handles errors via core.setFailed()
3. **src/wait.ts**: Example utility function

### Build Output

- **dist/index.js**: Rollup bundles all TypeScript + dependencies into this
  single file
  - This is what GitHub Actions actually executes
  - Must be committed to the repository
  - Generated from src/ via `npm run package` or `npm run bundle`

### Testing

- \***\*tests**/\*.test.ts\*\*: Jest test files
- \***\*fixtures**/\*.ts\*\*: Mock implementations of dependencies
  - Allows testing without importing actual @actions/core
  - Uses Jest's ESM mocking capabilities

### Configuration Files

- **tsconfig.json**: TypeScript compiler options (strict, ES2022, NodeNext)
- **eslint.config.mjs**: ESLint rules (flat config format)
- **jest.config.js**: Jest test runner configuration (ESM support)
- **rollup.config.ts**: Bundler configuration (TypeScript → single JS file)
- **.prettierrc.yml**: Code formatting rules

## Workflow Execution

### Local Development

```
Edit src/*.ts → npm run all → dist/index.js updated → git commit
```

### GitHub Actions Runtime

```
Workflow triggers → Checkout repo → Execute dist/index.js in Node.js → Outputs available
```

### CI Pipeline

```
Push/PR → Run workflows:
  1. Linter
  2. CI (format check, lint, test, run action)
  3. Check dist/ (ensure bundled code is current)
  4. CodeQL (security analysis)
```

## Important Notes

1. **dist/ Directory**: Always commit after running `npm run package` or
   `npm run bundle`
2. **ES Modules**: All imports must use `.js` extension (e.g., `'./main.js'` not
   `'./main'`)
3. **Entry Point**: GitHub Actions executes `dist/index.js`, not TypeScript
   source
4. **Dependencies**: Bundled into dist/index.js, so action has no runtime
   dependencies
