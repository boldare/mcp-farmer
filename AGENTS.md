# AGENTS.md

## Project Overview

mcp-farmer is a CLI tool for managing and analyzing MCP (Model Context Protocol) servers.

## Development Commands

- `bun run type-check` - Run TypeScript type checking
- `bun run lint` - Run ESLint
- `bun run test` - Run tests

## Code Style

- Write simple but robust and idiomatic TypeScript code
- Prefer early returns, simple control flow and imperative approach over complex abstractions and accidental complexity
- Only use comments if they add additional context not just duplicate the code

## CLI Conventions

- Exit codes: 0 (success/pass), 1 (findings/fail), 2 (invalid usage/error)
- Errors to stderr, results to stdout
- Provide actionable error messages

## Error Handling

- Catch errors at boundaries and convert to user-friendly messages
- Use try/finally to ensure connections and resources are cleaned up
- Set timeouts on all network operations

## File Structure

- `cli.ts` - Entry point. Parses CLI args and dispatches to subcommands
- `src/vet/` - Vet command: connects to MCP servers and runs quality checks on exposed tools
  - `command.ts` - Vet command logic: parses args, orchestrates MCP connection, runs checks, outputs results
  - `mcp.ts` - MCP client connection logic. Tries StreamableHTTP transport first, falls back to SSE
  - `tools.ts` - Tool analysis checkers: validates descriptions, input/output schemas, input counts, and detects duplicate tool names
  - `health.ts` - Health endpoint checker (`/health` route)
  - `oauth.ts` - OAuth authentication provider for MCP servers requiring auth
  - `reporters/` - Output formatters for vet results
    - `console.ts` - Terminal output formatting with ANSI colors. Prints tool details, findings, and summary
    - `html.ts` - HTML report generator with styled output
    - `json.ts` - JSON output formatter
    - `shared.ts` - Shared types and utilities for reporters
  - `tools.test.ts` - Unit tests for tool checkers
- `src/new/` - New command: scaffolds a new MCP server project
  - `command.ts` - New command logic: interactive prompts, project initialization, dependency installation
  - `templates/` - Template files copied to new projects
    - `server.ts` - MCP server definition template
    - `stdio.ts` - Stdio transport entry point
    - `http.ts` - HTTP transport entry point (Node.js built-in HTTP)
    - `http-hono.ts` - HTTP transport entry point using Hono framework
    - `tsconfig.json` - TypeScript config template
    - `gitignore` - Git ignore file template
- `src/market/` - Market command: browse and install popular MCP servers
  - `command.ts` - Market command logic: interactive prompts for selecting servers and clients, writes config to MCP client files
  - `servers.ts` - Curated list of popular MCP servers (Chrome DevTools, Playwright, Atlassian, Linear, Context7, Figma)
  - `clients.ts` - List of supported MCP clients (Cursor, VS Code, Claude Desktop, Claude Code) with config paths
  - `command.test.ts` - Unit tests for market command

## Vet Command Flow

1. CLI dispatches to `vetCommand()` with args
2. Connects to MCP server via `connect()` and checks `/health` endpoint in parallel
3. Lists tools from server and runs checkers via `runCheckers()`
4. Outputs results (JSON if `--output json`, HTML if `--output html`, otherwise formatted text)

## New Command Flow

1. CLI dispatches to `newCommand()` with args
2. Prompts user for server name, directory path, language, and package manager
3. Creates project directory and initializes with selected package manager
4. Copies template files with name substitutions
5. Installs dependencies (@modelcontextprotocol/sdk, zod) and dev dependencies (typescript, @types/node)

## Market Command Flow

1. CLI dispatches to `marketCommand()` with args
2. Prompts user to select from a list of curated MCP servers
3. Prompts user to select their MCP client (Cursor, VS Code, Claude Desktop, or Claude Code)
4. For package-based servers, prompts for preferred package runner (npx, bunx, pnpm dlx, yarn dlx)
5. Builds server configuration (either package-based with command/args or URL-based with url/type)
6. Prompts for confirmation and saves configuration to the selected client's config file
7. Displays configuration file path and restart instructions
