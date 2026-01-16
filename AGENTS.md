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
  - `health.ts` - Health endpoint checker (`/health` route)
  - `reporters/` - Output formatters for vet results
    - `console.ts` - Terminal output formatting with ANSI colors. Prints tool details, findings, and summary
    - `html.ts` - HTML report generator with styled output
    - `json.ts` - JSON output formatter
    - `shared.ts` - Shared types and utilities for reporters
  - `tools.test.ts` - Unit tests for tool checkers
- `src/try/` - Try command: interactively call tools on an MCP server
  - `command.ts` - Try command logic: connects to server, lists tools, prompts for input, calls tool
- `src/new/` - New command: scaffolds a new MCP server project
  - `command.ts` - New command logic: interactive prompts, template copying
  - `templates/` - Template files copied to new projects
    - `package.json` - Package manifest with dependencies pre-defined
    - `server.ts` - MCP server definition template
    - `stdio.ts` - Stdio transport entry point
    - `http.ts` - HTTP transport entry point (Node.js built-in HTTP)
    - `http-hono.ts` - HTTP transport entry point using Hono framework
    - `tsconfig.json` - TypeScript config template
    - `gitignore` - Git ignore file template
    - `Dockerfile` - Docker container configuration (optional release option)
    - `dockerignore` - Docker ignore file template
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
- `tests/` - Test files
  - `integration/` - Integration tests that spawn the CLI
    - `helpers/spawn.ts` - Helper to spawn CLI process and capture stdout/stderr
    - `new.test.ts` - Integration tests for the new command
    - `vet.test.ts` - Integration tests for the vet command
  - `testdata/` - Test fixtures like example openapi files

## Vet Command Flow

1. CLI dispatches to `vetCommand()` with args
2. Parses target via shared `parseTarget()`: URL, stdio command (after `--`), or resolves from config via `resolveTargetFromConfig()`
3. If multiple servers found in config, prompts user to select one via `selectServerFromEntries()`
4. Connects to MCP server via `connect()` (HTTP) or `connectStdio()` (stdio), checks `/health` endpoint for HTTP
5. Lists tools from server and runs checkers via `runCheckers()`
6. Outputs results (JSON if `--output json`, HTML if `--output html`, otherwise formatted text)

## New Command Flow

1. CLI dispatches to `newCommand()` with args
2. Prompts user for server name, directory path, language, and package manager
3. For HTTP transport, optionally prompts for release options (Dockerfile)
4. Creates project directory
5. Copies template files with name substitutions (package.json, server.ts, transport files, Docker files if selected)
6. Initializes git repository if requested
7. Displays instructions for user to run their package manager's install command

## Market Command Flow

1. CLI dispatches to `marketCommand()` with args
2. Prompts user to select from a list of curated MCP servers
3. Prompts user to select their MCP client (Cursor, VS Code, Claude Desktop, or Claude Code)
4. For package-based servers, prompts for preferred package runner (npx, bunx, pnpm dlx, yarn dlx)
5. Builds server configuration (either package-based with command/args or URL-based with url/type)
6. Prompts for confirmation and saves configuration to the selected client's config file
7. Displays configuration file path and restart instructions

## Try Command Flow

1. CLI dispatches to `tryCommand()` with args
2. Parses target via shared `parseTarget()`: URL or stdio command (after `--`)
3. Connects to MCP server via `connect()` (HTTP) or `connectStdio()` (stdio)
4. Lists available tools from the server
5. Prompts user to select a tool
6. Prompts for input values based on the tool's input schema
7. Calls the selected tool and displays the result

## Grow Command Flow

1. CLI dispatches to `growCommand()` with feature arg (`openapi` or `graphql`)
2. Prompts user for API spec path/URL
3. Parses spec and displays available endpoints/operations
4. User selects endpoints and response fields to include
5. User selects a coding agent (OpenCode, Claude Code, or Gemini CLI)
6. Spawns agent process and connects via ACP (Agent Client Protocol)
7. Sends prompt with selected endpoints and generation rules
8. Agent generates MCP tool code following project patterns

## Probe Command Flow

1. CLI dispatches to `probeCommand()` with args
2. Parses target via shared `parseTarget()`: URL, stdio command (after `--`), or resolves from config via `resolveTargetFromConfig()`
3. If multiple servers found in config, prompts user to select one via `selectServerFromEntries()`
4. Connects to MCP server via `connect()` (HTTP) or `connectStdio()` (stdio)
5. Lists available tools and prompts user to multi-select tools to probe
6. User selects a coding agent (OpenCode, Claude Code, or Gemini CLI)
7. Spawns agent process and connects via ACP, passing the MCP server as session config
8. Sends prompt instructing agent to generate test inputs and call each tool
9. Agent calls tools, captures results, and outputs a markdown probe report
