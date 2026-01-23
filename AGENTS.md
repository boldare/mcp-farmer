# AGENTS.md

CLI tool for managing and analyzing MCP (Model Context Protocol) servers.

## Quick Reference

- **Package manager:** bun
- **Entry point:** `cli.ts`

| Command              | Purpose                  |
| -------------------- | ------------------------ |
| `bun run type-check` | TypeScript type checking |
| `bun run lint`       | ESLint                   |
| `bun run test`       | Run tests                |

## Exit Codes

| Code | Meaning             |
| ---- | ------------------- |
| 0    | Success/pass        |
| 1    | Findings/fail       |
| 2    | Invalid usage/error |

## Code Style

### Function Design

- Keep functions small and locally understandable
- Push branching up; keep helpers mostly branch-free
- Prefer helpers that compute values rather than mutate shared state

### Boundaries

- Validate and normalize all external inputs (CLI args, env, config files, network responses)
- Prefer `unknown` + narrowing over `any`
- Use exhaustiveness checks for unions (`switch` + `assertNever`) when the set of cases is fixed

### Resource Limits

- Time out all network operations
- Bound retries, concurrency, and loops
- Always use `try/finally` for connections and resources.

### Comments

Add a comment when the reader would otherwise have to reverse-engineer intent, tradeoffs, or invariants. If a comment restates what the code already says, delete it.

### Abstraction

Extract a helper only when it provides:

- Reuse across multiple files
- A type guard or assertion
- A clear readability win in the calling code

Refactor after behavior is correct, not before.

### Dependencies

Add a dependency only when it clearly reduces risk or complexity compared to writing it in-repo.

## Testing

### Workflow

Follow TDD (Red -> Green -> Refactor):

1. Write a failing test that describes the next behavior
2. Implement the smallest change to pass
3. Refactor

Keep steps small: one behavior per test, small diffs, run tests frequently.

### Test Structure

Use table-style tests when testing similar inputs with varying expected outputs.

### Isolation

- Use fakes and fixed clocks instead of real network/time/randomness
- No order dependence between tests
- Clean up global/shared state after each test

## CLI Conventions

### I/O

- Errors → stderr
- Results → stdout

### Error Handling

Errors should help users fix the problem:

```
Bad:  "Connection failed"
Good: "Connection to localhost:3000 failed: ECONNREFUSED. Is the server running?"
```

**Error flow:**

1. **Shared code** (`src/shared/**`): Throw typed errors with context. Never call `process.exit()`.
2. **Command handlers** (`src/*/command.ts`): Catch errors, convert to user-friendly messages.
3. **CLI boundary** (`cli.ts`): Map error types to exit codes.
