# mcp-farmer

A CLI tool for managing and analyzing MCP (Model Context Protocol) servers.

## Installation

```bash
bun install
```

## Usage

```bash
# Show available commands
bun run cli.ts --help

# Vet an MCP server
bun run cli.ts vet http://localhost:3000/mcp

# Output results as JSON
bun run cli.ts vet http://localhost:3000/mcp --output json
```

## Commands

### vet

Vet an MCP server by connecting and running quality checks on its exposed tools.

```bash
bun run cli.ts vet <url> [options]
```

Options:

- `--output json` - Output results as JSON to stdout
- `--help` - Show help message
