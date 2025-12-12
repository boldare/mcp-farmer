import { createServer as createHttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";

const PORT = 3000;

const httpServer = createHttpServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url !== "/mcp") {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  if (req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    return;
  }

  if (req.method === "GET" || req.method === "DELETE") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  res.writeHead(405);
  res.end("Method Not Allowed");
});

httpServer.listen(PORT, () => {
  console.log(`MCP server listening on http://localhost:${PORT}/mcp`);
});
