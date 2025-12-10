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
bun run cli.ts vet <url> [options]
```

Options:

- `--output json` - Output results as JSON to stdout
- `--help` - Show help message
