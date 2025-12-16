# mcp-farmer

[![npm version](https://badge.fury.io/js/mcp-farmer.svg)](https://www.npmjs.com/package/mcp-farmer)

A CLI tool for scaffolding and analyzing MCP (Model Context Protocol) servers.

```
Usage: mcp-farmer <command> [options]

Commands:
  vet <url>    Vet an MCP server by connecting and running checks
  new          Create a new MCP server project
  market       Browse and install popular MCP servers
  try <url>    Interactively call a tool on an MCP server

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

### `vet` — Audit MCP server quality

```bash
mcp-farmer vet http://localhost:3000/mcp              # HTTP
mcp-farmer vet -- bunx @playwright/mcp@latest         # Stdio
mcp-farmer vet -o html -- bunx @playwright/mcp > report.html
```

**Options:** `-o, --output json|html`, `--oauth`, `--oauth-port <port>`

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
