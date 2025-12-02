# Task Completion Checklist

When completing a task or making changes to the codebase, follow these steps:

## 1. Code Quality Checks

```bash
# Format the code
npm run format:write

# Run the linter
npm run lint
```

## 2. Testing

```bash
# Run all tests
npm test

# Verify coverage if needed
npm run coverage
```

## 3. Build Distribution

**CRITICAL**: The `dist/` directory MUST be updated and committed!

```bash
# Bundle the code (formats + packages)
npm run bundle
```

This step is crucial because:

- GitHub Actions runs the code from `dist/index.js`, not the TypeScript source
- The check-dist.yml workflow will fail if dist/ is out of sync
- The bundled file includes all dependencies

## 4. Complete Workflow (Recommended)

```bash
# Run everything at once
npm run all
```

This runs: format:write → lint → test → coverage → package

## 5. Verify Changes

- Ensure `dist/index.js` and `dist/index.js.map` are updated
- Check that all tests pass
- Verify linting has no errors
- Review git diff to ensure changes are expected

## 6. Commit Changes

```bash
git add .
git commit -m "Description of changes"
```

**Important**: Always commit the `dist/` directory changes along with source
changes!

## 7. Test Locally (Optional but Recommended)

```bash
npm run local-action
```

Or create a `.env` file with test inputs and run:

```bash
npx @github/local-action . src/main.ts .env
```

## CI/CD Workflows to Pass

The following workflows must pass for PRs to main:

1. **Linter** (.github/workflows/linter.yml)
2. **CI** (.github/workflows/ci.yml)
   - TypeScript Tests (format check, lint, test)
   - GitHub Actions Test (actually runs the action)
3. **Check dist/** (.github/workflows/check-dist.yml)
   - Verifies dist/ is up to date
4. **CodeQL** (.github/workflows/codeql-analysis.yml)
   - Security analysis

## Common Gotchas

1. **Forgot to run bundle**: dist/ out of sync → check-dist workflow fails
2. **ES Module imports**: Must use `.js` extension in imports, not `.ts`
3. **Mocking in tests**: Use `jest.unstable_mockModule()` before importing
   modules
4. **Coverage badge**: Only update if you want to regenerate the badge SVG
