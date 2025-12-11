# mcp-farmer

A CLI tool for scaffolding and analyzing MCP (Model Context Protocol) servers.

## Installation

```bash
bun install
```

## Commands

### new

Create a new MCP server project interactively.

```bash
bun run cli.ts new
```

### vet

Vet an MCP server by connecting and running quality checks on its exposed tools.

```bash
# HTTP mode
bun run cli.ts vet <url> [options]

# Stdio mode
bun run cli.ts vet [options] -- <command> [args...]
```

Options:

- `-o, --output json|html` - Output format (json or html)
- `--oauth` - Enable OAuth authentication flow (HTTP mode only)
- `--oauth-port <port>` - Port for OAuth callback server (default: 9876)
- `-h, --help` - Show help message

Examples:

```bash
# HTTP server
bun run cli.ts vet http://localhost:3000/mcp

# Stdio server with HTML report
bun run cli.ts vet --output html -- bunx @playwright/mcp@latest > report.html
```

Rules:

- Missing tool description
- Missing input description
- Missing output schema
- Too many required inputs (more than 5)
- Too many tools exposed (more than 30)
- Duplicate tool names
- Similar tool descriptions
- Potentially dangerous tool names (e.g., exec, eval, rm, drop)
