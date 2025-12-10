import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class AuthenticationRequiredError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly authHeader?: string,
    public readonly errorDescription?: string,
  ) {
    const message = errorDescription ?? "Authentication required";
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

function isAuthError(error: unknown): boolean {
  if (error instanceof Error && "code" in error) {
    return (error as { code: number }).code === 401;
  }
  return false;
}

async function fetchAuthDetails(
  url: URL,
): Promise<{ authHeader?: string; errorDescription?: string }> {
  try {
    const response = await fetch(url, { method: "GET" });
    const authHeader = response.headers.get("WWW-Authenticate") ?? undefined;
    const body = await response.text();

    return { authHeader, errorDescription: body || undefined };
  } catch {
    return {};
  }
}

export async function connect(
  url: URL,
): Promise<{ client: Client; transport: Transport }> {
  const client = new Client({ name: "mcp-farmer", version: "1.0.0" });

  try {
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);
    return { client, transport };
  } catch (streamableError) {
    if (isAuthError(streamableError)) {
      const details = await fetchAuthDetails(url);
      throw new AuthenticationRequiredError(
        401,
        details.authHeader,
        details.errorDescription,
      );
    }

    // fallback to SSE
    try {
      const transport = new SSEClientTransport(url);
      await client.connect(transport);
      return { client, transport };
    } catch (sseError) {
      if (isAuthError(sseError)) {
        const details = await fetchAuthDetails(url);
        throw new AuthenticationRequiredError(
          401,
          details.authHeader,
          details.errorDescription,
        );
      }
      throw sseError;
    }
  }
}
