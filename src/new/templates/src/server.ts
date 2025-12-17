import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function createMcpServer() {
  const server = new McpServer({
    name: "{{name}}",
    version: "1.0.0",
  });

  server.registerTool(
    "hello",
    {
      title: "Hello World",
      description: "Says hello to the provided name",
      inputSchema: { name: z.string().describe("Name to greet") },
    },
    async ({ name }) => ({
      content: [{ type: "text", text: `Hello, ${name}!` }],
    }),
  );

  return server;
}
