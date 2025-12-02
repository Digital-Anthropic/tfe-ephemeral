# Suggested Commands

## Development Workflow

### Installation

```bash
npm install
```

### Testing

```bash
# Run tests
npm test

# Run tests for CI (no warnings)
npm run ci-test

# Generate coverage badge
npm run coverage
```

### Code Quality

```bash
# Format code (write changes)
npm run format:write

# Check formatting (no changes)
npm run format:check

# Run linter
npm run lint
```

### Building

```bash
# Build dist/ directory
npm run package

# Watch mode for package
npm run package:watch

# Format and package together
npm run bundle
```

### Complete Workflow

```bash
# Run all checks and build (format, lint, test, coverage, package)
npm run all
```

### Local Testing

```bash
# Test action locally with .env file
npm run local-action

# Or directly:
npx @github/local-action . src/main.ts .env
```

## System Commands (macOS/Darwin)

- `git` - Version control
- `ls` - List directory contents
- `cd` - Change directory
- `grep` - Search text
- `find` - Find files
- Standard Unix commands are available

## Node Version Management

The project uses Node.js v24+. The `.node-version` file specifies the exact
version:

- Compatible with `nodenv` and `fnm` version managers
- Used automatically by GitHub Actions setup-node

## Release Process

```bash
# Use the provided release script
./script/release
```

This script handles:

1. Fetching latest release tag
2. Prompting for new version
3. Creating and syncing tags
4. Pushing to remote
