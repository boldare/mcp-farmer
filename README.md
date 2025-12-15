# mcp-farmer

[![npm version](https://badge.fury.io/js/mcp-farmer.svg)](https://www.npmjs.com/package/mcp-farmer)

A CLI tool for scaffolding and analyzing MCP (Model Context Protocol) servers.

## Installation

### Usage with npx (no install)

```bash
npx mcp-farmer <command>
```

```bash
bunx mcp-farmer <command>
```

### Global Installation

```bash
npm install -g mcp-farmer
```

## Commands

### new

Create a new MCP server project interactively.

```bash
mcp-farmer new
```

The command will guide you through:

- Server name and directory path
- Language selection (TypeScript)
- HTTP framework choice (Native Node.js HTTP or Hono)
- Package manager selection (npm, pnpm, yarn, deno, bun)

The scaffolded project includes:

- Basic MCP server implementation with example tool
- HTTP and stdio transport entry points
- TypeScript configuration
- Run scripts for both transports

### market

Browse and install popular MCP servers to your client configuration. In the future, this will support MCP registries.

```bash
mcp-farmer market
```

The command will guide you through:

- Selecting an MCP server from the curated list
- Choosing your MCP client (Claude Code, Claude Desktop, Cursor, VS Code, OpenCode, etc.)
- Picking a package runner (npx, bunx, pnpm dlx, yarn dlx)
- Adding the server configuration to your client's config file

### vet

Vet an MCP server by connecting and running quality checks on its exposed tools.

```bash
# HTTP mode
mcp-farmer vet <url> [options]

# Stdio mode
mcp-farmer vet [options] -- <command> [args...]
```

Options:

- `-o, --output json|html` - Output format (json or html)
- `--oauth` - Enable OAuth authentication flow (HTTP mode only)
- `--oauth-port <port>` - Port for OAuth callback server (default: 9876)
- `-h, --help` - Show help message

Examples:

```bash
# HTTP server
mcp-farmer vet http://localhost:3000/mcp

# Pipe large output to less
mcp-farmer vet https://mcp.svelte.dev/mcp | less

# Stdio server with HTML report
mcp-farmer vet --output html -- bunx @playwright/mcp@latest > report.html
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

## Development

For contributors who want to work on mcp-farmer:

```bash
# Clone the repository
git clone https://github.com/boldare/mcp-farmer.git
cd mcp-farmer

# Install dependencies
bun install

# Run from source
bun run cli.ts <command>

# Run tests
bun test

# Type checking
bun run type-check

# Lint
bun run lint

# Build for npm
bun run build
```

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
