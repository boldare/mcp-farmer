import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

import type { CliOAuthProvider } from "./oauth.js";

export class AuthenticationRequiredError extends Error {
  statusCode: number;
  authHeader?: string;
  errorDescription?: string;

  constructor(
    statusCode: number,
    authHeader?: string,
    errorDescription?: string,
  ) {
    const message = errorDescription ?? "Authentication required";
    super(message);
    this.name = "AuthenticationRequiredError";
    this.statusCode = statusCode;
    this.authHeader = authHeader;
    this.errorDescription = errorDescription;
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

type TransportClass =
  | typeof StreamableHTTPClientTransport
  | typeof SSEClientTransport;

async function tryConnect(
  client: Client,
  url: URL,
  TransportClass: TransportClass,
  authProvider?: CliOAuthProvider,
): Promise<Transport> {
  const transport = new TransportClass(url, { authProvider });

  try {
    await client.connect(transport);
    return transport;
  } catch (error) {
    if (!(error instanceof UnauthorizedError) || !authProvider) {
      throw error;
    }

    // OAuth flow triggered - wait for callback and retry
    const code = await authProvider.waitForAuthorizationCode();
    const retryTransport = new TransportClass(url, { authProvider });
    await retryTransport.finishAuth(code);
    await client.connect(retryTransport);
    return retryTransport;
  }
}

export async function connect(
  url: URL,
  authProvider?: CliOAuthProvider,
): Promise<{ client: Client; transport: Transport }> {
  const client = new Client({ name: "mcp-farmer", version: "1.0.0" });

  // Try StreamableHTTP first
  try {
    const transport = await tryConnect(
      client,
      url,
      StreamableHTTPClientTransport,
      authProvider,
    );
    return { client, transport };
  } catch (error) {
    if (!authProvider && isAuthError(error)) {
      const details = await fetchAuthDetails(url);
      throw new AuthenticationRequiredError(
        401,
        details.authHeader,
        details.errorDescription,
      );
    }

    // Non-auth error from StreamableHTTP - try SSE fallback
    if (error instanceof UnauthorizedError) {
      throw error;
    }
  }

  // Fallback to SSE
  try {
    const transport = await tryConnect(
      client,
      url,
      SSEClientTransport,
      authProvider,
    );
    return { client, transport };
  } catch (error) {
    if (!authProvider && isAuthError(error)) {
      const details = await fetchAuthDetails(url);
      throw new AuthenticationRequiredError(
        401,
        details.authHeader,
        details.errorDescription,
      );
    }
    throw error;
  }
}

export async function connectStdio(
  command: string,
  args: string[],
): Promise<{ client: Client; transport: Transport }> {
  const client = new Client({ name: "mcp-farmer", version: "1.0.0" });
  const transport = new StdioClientTransport({ command, args });
  await client.connect(transport);
  return { client, transport };
}
