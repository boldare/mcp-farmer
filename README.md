# mcp-farmer

[![npm version](https://badge.fury.io/js/mcp-farmer.svg)](https://badge.fury.io/js/mcp-farmer)

A CLI tool for scaffolding, extending and analyzing MCP (Model Context Protocol) servers.

While this tool is stable and ready to be used you can expect new features and improvements coming soon™.

```
Usage: mcp-farmer <command> [options]

Commands:
  vet [url]    Vet an MCP server (auto-detects from config if no URL)
  new          Create a new MCP server project
  market       Browse and install popular MCP servers
  try <url>    Interactively call a tool on an MCP server
  grow         Generate MCP tools from OpenAPI or GraphQL specs

Options:
  --help       Show this help message
```

## Quick Start

```bash
npx mcp-farmer <command>
# or
bunx mcp-farmer <command>
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

### `grow` — Generate MCP tools from API specs

```bash
mcp-farmer grow openapi   # Generate tools from OpenAPI/Swagger spec
mcp-farmer grow graphql   # Generate tools from GraphQL endpoint
```

Parses your API specification, lets you select endpoints/operations and response fields, then uses an AI coding agent (OpenCode, Claude Code, or Gemini CLI) via ACP to generate the MCP tool code.

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

**Options:** `-c, --config <path>`, `-o, --output json|html`, `--oauth`, `--oauth-port <port>`

**Checks:** missing descriptions, missing schemas, too many inputs (>5), too many tools (>30), duplicates, similar descriptions, dangerous tool names.

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
