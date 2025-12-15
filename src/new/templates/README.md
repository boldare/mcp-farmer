# {{name}}

An MCP server built with [Model Context Protocol](https://modelcontextprotocol.io).

## Quick Start

```bash
# Install dependencies
{{installCommand}}

# Run the server
{{runCommand}}
```

## Testing

Vet your server with mcp-farmer:

```bash
# For HTTP transport
{{vetHttpCommand}}

# For stdio transport
{{vetStdioCommand}}
```

## Project Structure

- `server.ts` - MCP server definition with tools
  {{httpFileDoc}}{{stdioFileDoc}}

## Learn More

- [MCP Documentation](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
