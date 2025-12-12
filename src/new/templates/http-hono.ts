import { Hono } from "hono";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { toFetchResponse, toReqRes } from "fetch-to-node";
import { createMcpServer } from "./server.js";

const PORT = 3000;

const app = new Hono();

app.post("/mcp", async (c) => {
  const { req, res } = toReqRes(c.req.raw);

  const server = createMcpServer();

  try {
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

    transport.onerror = console.error.bind(console);

    await server.connect(transport);

    await transport.handleRequest(req, res, await c.req.json());

    res.on("close", () => {
      console.log("Request closed");
      transport.close();
      server.close();
    });

    return toFetchResponse(res);
  } catch (e) {
    console.error(e);
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      },
      { status: 500 },
    );
  }
});

app.get("/mcp", async (c) => {
  return c.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    },
    { status: 405 },
  );
});

app.delete("/mcp", async (c) => {
  return c.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    },
    { status: 405 },
  );
});

console.log(`MCP server listening on http://localhost:${PORT}/mcp`);

export default app;
