import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Config, Context } from "@netlify/functions";
import { toFetchResponse, toReqRes } from "fetch-to-node";

import { createMcpServer } from "../../src/server.js";

export default async (req: Request, _context: Context) => {
  try {
    const { req: nodeReq, res: nodeRes } = toReqRes(req);

    const server = createMcpServer();

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    transport.onerror = (error) => {
      console.error("Error in MCP transport", error);
    };

    await server.connect(transport);

    await transport.handleRequest(nodeReq, nodeRes);

    return toFetchResponse(nodeRes);
  } catch (error) {
    console.error("Internal server error", error);
    return new Response("Internal server error", {
      status: 500,
    });
  }
};

export const config: Config = {
  path: ["/mcp"],
  rateLimit: {
    windowLimit: 100,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
