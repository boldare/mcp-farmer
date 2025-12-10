import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export async function connect(
  url: URL,
): Promise<{ client: Client; transport: Transport }> {
  const client = new Client({ name: "mcp-farmer", version: "1.0.0" });

  try {
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);
    return { client, transport };
  } catch {
    const transport = new SSEClientTransport(url);
    await client.connect(transport);
    return { client, transport };
  }
}
