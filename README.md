## mcp-farmer

[![npm version](https://badge.fury.io/js/mcp-farmer.svg)](https://badge.fury.io/js/mcp-farmer)

A CLI tool for scaffolding, extending, probing, and auditing MCP (Model Context Protocol) servers.

While this tool is stable and ready to be used you can expect new features and improvements coming soon™.

## Why mcp-farmer?

- **Ship MCP servers faster**: scaffold a server, generate tools from OpenAPI/GraphQL, and validate tool quality.
- **Trust but verify**: vet third‑party MCP servers (including `/health`, tools, prompts, and resources) before adding them to your client.
- **Better tool UX for LLMs**: catch missing descriptions/schemas/annotations and other issues that reduce reliability.
- **Shareable outputs**: generate **HTML/JSON/Markdown** vet reports and a **Markdown probe report** you can attach to PRs/issues.

## Highlights

- **Targets**: connect via **HTTP URL** or **stdio command** (after `--`).
- **Robust HTTP connect**: tries Streamable HTTP first, falls back to SSE, with timeouts and actionable errors.
- **Auto-detect from config**: discovers MCP servers from common client configs and lets you pick one interactively.
- **OAuth support (HTTP)**: `vet` can run an OAuth browser flow via `--oauth` (configurable `--oauth-port`).
- **Interactive exploration**: `try` can call **tools** and read **resources**.
- **AI-assisted workflows**: `grow` generates tools; `probe` calls tools with AI-generated inputs and writes a report.

## What is MCP?

MCP (Model Context Protocol) is a standard way for LLM apps/agents to connect to “capabilities” exposed by servers — typically **tools**, **resources**, and **prompts** — over transports like **HTTP** or **stdio**. Clients can discover what a server offers (schemas + descriptions), then call those capabilities in a structured way.

If you’re new to MCP, start here: [Model Context Protocol](https://modelcontextprotocol.io).

## What is ACP?

ACP (Agent Client Protocol) is a protocol for driving “coding agents” from a CLI/app in a consistent way (start a session, stream updates, request permissions, read/write files, and optionally select models). `mcp-farmer` uses ACP for commands like `grow` and `probe` so it can work with multiple agents (e.g. OpenCode, Claude Code, Gemini CLI, GitHub Copilot CLI) **without reinventing a bespoke integration per agent**.

## Quick Start

**Requirements:** Node.js **>= 20**.

```
Usage: mcp-farmer <command> [options]

Commands:
  vet [url]    Vet an MCP server (auto-detects from config if no URL)
  new          Create a new MCP server project
  market       Browse and install popular MCP servers
  try <url>    Interactively call a tool on an MCP server
  grow         Generate MCP tools from OpenAPI or GraphQL specs
  probe        Probe MCP tools by calling them with AI-generated inputs

Options:
  --help       Show this help message
```

Global install:

```bash
npm install -g mcp-farmer
# or
bun add -g mcp-farmer
```

No install for quick tests:

```bash
npx mcp-farmer try http://localhost:3000/mcp
bunx mcp-farmer try http://localhost:3000/mcp
npx mcp-farmer vet http://localhost:3000/mcp
bunx mcp-farmer vet http://localhost:3000/mcp
```

Common workflows:

```bash
# Vet and export a shareable report
mcp-farmer vet http://localhost:3000/mcp --output markdown > report.md
mcp-farmer vet http://localhost:3000/mcp --output html > report.html

# If the server requires auth (HTTP)
mcp-farmer vet https://secure-server.com/mcp --oauth

# Stdio mode (spawn a local server process)
mcp-farmer vet -- npx -y @modelcontextprotocol/server-memory
mcp-farmer try -- npx -y @modelcontextprotocol/server-memory
```

## Commands

### `new` — Scaffold a new MCP server

```bash
mcp-farmer new
```

Interactively creates a TypeScript MCP server with HTTP/stdio transports, your choice of framework (Node.js HTTP or Hono), and package manager.

### `market` — Install popular MCP servers

```bash
mcp-farmer market
```

Browse curated MCP servers and add them to your client config (Claude Code, Claude Desktop, Cursor, VS Code, etc.).

### `try` — Call tools interactively

```bash
mcp-farmer try http://localhost:3000/mcp              # HTTP
mcp-farmer try -- npx -y @modelcontextprotocol/server-memory  # Stdio
```

Interactively calls tools and (when supported) lets you read server resources.

### `grow` — Generate MCP tools from API specs

```bash
mcp-farmer grow openapi   # Generate tools from OpenAPI/Swagger spec
mcp-farmer grow graphql   # Generate tools from GraphQL endpoint
```

Parses your API specification, lets you select endpoints/operations and response fields, then uses an AI coding agent (OpenCode, Claude Code, or Gemini CLI) via ACP to generate the MCP tool code.

**Note:** `grow` requires at least one supported ACP agent to be installed (you’ll select one in the CLI).

### `probe` — Test MCP tools with AI

```bash
mcp-farmer probe http://localhost:3000/mcp              # HTTP
mcp-farmer probe                                        # Auto-detect from config
mcp-farmer probe --config .cursor/mcp.json              # Explicit config file
mcp-farmer probe -- npx -y @modelcontextprotocol/server-memory  # Stdio
```

Connects to an MCP server, lets you select tools to probe, then uses an AI coding agent (OpenCode, Claude Code, or Gemini CLI) to generate test inputs, call each tool, and produce a markdown probe report.

### `vet` — Audit MCP server quality

```bash
mcp-farmer vet http://localhost:3000/mcp              # HTTP
mcp-farmer vet                                        # Auto-detect from config
mcp-farmer vet --config .cursor/mcp.json              # Explicit config file
mcp-farmer vet -- bunx @playwright/mcp@latest         # Stdio
```

Printing the report to HTML file

```bash
mcp-farmer vet -o html -- bunx @playwright/mcp > report.html
```

Auto-detects MCP servers from local config files (Cursor, VS Code, Claude Desktop, Claude Code, OpenCode, Gemini CLI). If multiple servers are found, prompts you to select one.

**Options:** `-c, --config <path>`, `-o, --output json|html|markdown`, `--oauth`, `--oauth-port <port>`

**Checks:**

- Missing tool descriptions
- Missing input/output schemas
- Too many inputs (>5)
- Too many tools (>30)
- Duplicate tool names
- Similar tool descriptions
- Dangerous tool names
- Missing tool annotations (readOnlyHint/idempotentHint/openWorldHint/destructiveHint)
- Potential PII handling indicators (name/description/input hints)

## Development

```bash
git clone https://github.com/boldare/mcp-farmer.git && cd mcp-farmer
bun install
bun run cli.ts <command>   # Run from source
bun test                   # Tests
bun run type-check         # Type checking
bun run lint               # Lint
bun run build              # Build for npm
```

## License

MIT — see [LICENSE](LICENSE)
