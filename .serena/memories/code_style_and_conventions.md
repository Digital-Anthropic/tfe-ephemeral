# Code Style and Conventions

## TypeScript Configuration

- **Strict mode enabled**: All strict checks are on
- **No implicit any**: All types must be explicit or inferred
- **Strict null checks**: Enabled
- **No unused locals**: Enabled
- **Module resolution**: NodeNext (modern Node.js ESM support)
- **Import style**: Use `.js` extensions in imports (ESM requirement)
  - Example: `import { run } from './main.js'` (even though source is .ts)

## Formatting (Prettier)

- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Single quotes for strings
- **Semicolons**: No semicolons
- **Line width**: 80 characters
- **Line endings**: LF (Unix-style)
- **Trailing commas**: None
- **Arrow function parens**: Always
- **Bracket spacing**: Yes
- **Bracket same line**: Yes

## ESLint Rules

- **camelCase**: Off (allows snake_case)
- **console.log**: Allowed (no-console is off)
- **Import namespace**: Allowed
- **Prettier errors**: Will fail the build
- **TypeScript recommended rules**: Enabled

## File Organization

```
src/
  index.ts       # Entry point - imports and runs main
  main.ts        # Main action logic
  wait.ts        # Helper functions

__tests__/
  main.test.ts   # Tests for main logic
  wait.test.ts   # Tests for helper functions

__fixtures__/
  core.ts        # Mock for @actions/core
  wait.ts        # Mock for wait function

dist/
  index.js       # Bundled output (generated, must be committed)
```

## Documentation Style

- **JSDoc comments**: Used for all exported functions
- **@param**: Document parameters
- **@returns**: Document return values
- Example:

```typescript
/**
 * Waits for a number of milliseconds.
 *
 * @param milliseconds The number of milliseconds to wait.
 * @returns Resolves with 'done!' after the wait is over.
 */
```

## Testing Conventions

- **Test file naming**: `*.test.ts`
- **ESM mocking**: Use `jest.unstable_mockModule()` before imports
- **Dynamic imports**: Import modules under test dynamically with
  `await import()`
- **Mock fixtures**: Store in `__fixtures__/` directory
- **Test structure**: describe/it blocks with clear descriptions
- **Coverage**: Istanbul comments for excluding code (e.g.,
  `/* istanbul ignore next */`)

## Action Development

- **Input handling**: Use `core.getInput()` from @actions/core
- **Output setting**: Use `core.setOutput()` to set action outputs
- **Error handling**: Catch errors and use `core.setFailed()` to fail the action
- **Debug logging**: Use `core.debug()` for debug messages
- **Async functions**: Main action logic should be async
