# AGENTS.md

## Project Overview

mcp-farmer is a CLI tool for managing and analyzing MCP (Model Context Protocol) servers.

## Development Commands

- `bun run type-check` - Run TypeScript type checking
- `bun run lint` - Run ESLint
- `bun run test` - Run tests

## Code Style

- Write simple, robust, idiomatic TypeScript.
- Prefer explicit, boring code over clever code:
  - prefer early returns and shallow nesting
  - prefer straightforward loops/conditionals over deeply chained functional pipelines
  - avoid “action at a distance” (hidden mutation, surprising control flow)
- Keep functions small and locally understandable:
  - keep control flow centralized (push branching up, keep helpers mostly branch-free)
  - keep state mutation centralized; prefer helpers that compute values rather than mutate shared state
- Be explicit at boundaries:
  - validate and normalize all external inputs (CLI args, env, config files, network responses)
  - prefer `unknown` + narrowing over `any`
  - use exhaustiveness checks for unions (`switch` + `assertNever`) when appropriate
- Fail fast with actionable errors:
  - throw/return errors with enough context for the user to fix the issue
  - don’t swallow errors; handle them at boundaries and map to CLI exit codes
  - always clean up resources with `try/finally`
- Put limits on work:
  - time out network operations
  - bound retries, concurrency, and loops where practical
- Comments are for “why”, not “what”:
  - add a comment when the intent, tradeoff, or invariant is non-obvious
  - prefer changing code to be self-explanatory over adding commentary
- Extract a helper only if it meaningfully improves maintainability:
  - reuse across files, a type guard, or a clear readability win
  - avoid premature abstraction; refactor after behavior is correct
- Be conservative with dependencies:
  - add a dependency only when it clearly reduces risk/complexity compared to in-repo code

## Tests

- Prefer test-first (TDD, Kent Beck): write a failing test that describes the next bit of behavior, implement the smallest change to pass, then refactor (Red → Green → Refactor).
- Prefer small steps: one behavior per test, small diffs, run tests frequently.
- Prefer table style tests for similar inputs.
- Keep tests fast, deterministic, and isolated:
  - avoid real network/time/randomness unless explicitly under test (use fakes and fixed clocks)
  - no order dependence; clean up global/shared state after each test
- Test behavior, not implementation details (avoid brittle coupling to internals).
- Use smart coverage: prioritize critical paths, edge cases, and regressions; don’t add redundant tests just to raise coverage.
- Keep tests readable: clear names, Arrange/Act/Assert (or Given/When/Then), minimal shared setup (abstract only when it improves clarity).

## CLI Conventions

- Exit codes: 0 (success/pass), 1 (findings/fail), 2 (invalid usage/error)
- Errors to stderr, results to stdout
- Provide actionable error messages
- Prefer throwing typed errors from shared code and mapping to exit codes at the CLI boundary (`cli.ts`)

## Error Handling

- Catch errors at boundaries and convert to user-friendly messages
- Use try/finally to ensure connections and resources are cleaned up
- Set timeouts on all network operations
- Avoid `process.exit()` in shared/library modules (`src/shared/**`); only exit from CLI entrypoints/commands

## File Structure

- `cli.ts` - Entry point. Parses CLI args and dispatches to subcommands
- `src/shared/` - Shared utilities used across commands
  - `mcp.ts` - MCP client connection logic. Tries StreamableHTTP transport first, falls back to SSE
  - `oauth.ts` - OAuth authentication provider for MCP servers requiring auth
  - `config.ts` - MCP client config file parsing: discovers and parses config files from Cursor, VS Code, Claude Desktop, Claude Code, OpenCode, and Gemini CLI. Also exports `fileExists`, `getClaudeDesktopPath`, `getClaudeDesktopHint` utilities
  - `target.ts` - CLI argument parsing for command targets: parses URLs and stdio commands (after `--`), server selection from config, and resolves targets from config files
  - `acp.ts` - Shared ACP (Agent Client Protocol) utilities: agent spawning, connection management, permission handling, and session update handlers used by grow and probe commands
  - `schema.ts` - Tool schema extraction and type formatting utilities
  - `text.ts` - Text utilities (pluralization)
  - `log.ts` - Debug logging to file
  - `errors.ts` - Typed CLI errors + exit-code mapping helpers used by entrypoints
  - `version.ts` - CLI version resolution (from `package.json`) for both dev and built (`dist/`) layouts
- `src/vet/` - Vet command: connects to MCP servers and runs quality checks on exposed tools
  - `command.ts` - Vet command logic: parses args, orchestrates MCP connection, runs checks, outputs results
  - `tools.ts` - Tool analysis checkers: validates descriptions, input/output schemas, input counts, and detects duplicate tool names
  - `tools.test.ts` - Unit tests for tool checkers
  - `health.ts` - Health endpoint checker (`/health` route)
  - `reporters/` - Output formatters for vet results (console, html, json, markdown)
- `src/try/` - Try command: interactively call tools on an MCP server
  - `command.ts` - Try command logic: connects to server, lists tools, prompts for input, calls tool
- `src/new/` - New command: scaffolds a new MCP server project
  - `command.ts` - New command logic: interactive prompts, template copying
  - `templates/` - Template files copied to new projects when calling `new` command
- `src/market/` - Market command: browse and install popular MCP servers
  - `command.ts` - Market command logic: interactive prompts for selecting servers and clients, writes config to MCP client files
  - `servers.ts` - Curated list of popular MCP servers (Chrome DevTools, Playwright, Atlassian, Linear, Context7, Figma)
  - `clients.ts` - List of supported MCP clients (Cursor, VS Code, Claude Desktop, Claude Code) with config paths
  - `command.test.ts` - Unit tests for market command
- `src/grow/` - Grow command: generate MCP tools from API specifications using AI coding agents
  - `command.ts` - Grow command logic: interactive prompts for selecting endpoints/operations and fields, spawns coding agent via ACP
  - `openapi.ts` - OpenAPI/Swagger parser: extracts endpoints, parameters, and response schemas
  - `graphql.ts` - GraphQL introspection: fetches schema and extracts queries/mutations with arguments and return types
  - `acp.ts` - ACP client implementation: handles file operations, permissions, and displays agent progress
- `src/probe/` - Probe command: probe MCP tools by calling them with AI-generated test inputs
  - `command.ts` - Probe command logic: connects to MCP server, lists tools, spawns coding agent via ACP with MCP server config, prompts agent to test tools
  - `acp.ts` - ACP client implementation for probe: tracks tool calls and displays progress
- `src/doc/` - Doc command: generate beautiful HTML documentation for an MCP server
  - `command.ts` - Doc command logic: connects to server, fetches capabilities, prompts for output path, generates HTML
  - `html.ts` - HTML documentation generator: types, utilities, render functions, and main orchestrator
  - `styles.ts` - CSS styles for the generated HTML documentation
  - `scripts.ts` - SVG icons and client-side JavaScript for theme toggle, search, and copy functionality
- `tests/` - Test files
  - `integration/` - Integration tests that spawn the CLI
  - `testdata/` - Test fixtures like example openapi files
