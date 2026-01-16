import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

import type { CliOAuthProvider } from "./oauth.js";
import { CLI_VERSION } from "./version.js";

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

export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionError";
  }
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const networkIndicators = [
    "enotfound",
    "econnrefused",
    "etimedout",
    "econnreset",
    "enetunreach",
    "fetch failed",
    "network",
    "dns",
    "typo in the url",
    "unable to connect",
  ];

  return networkIndicators.some((indicator) => message.includes(indicator));
}

function getConnectionErrorMessage(error: unknown, url: URL): string {
  if (!(error instanceof Error)) {
    return `Failed to connect to ${url.origin}`;
  }

  const message = error.message.toLowerCase();

  if (message.includes("enotfound") || message.includes("dns")) {
    return `Could not resolve host: ${url.hostname}`;
  }
  if (
    message.includes("econnrefused") ||
    message.includes("unable to connect")
  ) {
    return `Connection refused: ${url.origin} - is the server running?`;
  }
  if (message.includes("etimedout") || message.includes("timed out")) {
    return (
      `Connection timed out: ${url.origin}\n` +
      `Check that the server is reachable and the URL is correct.`
    );
  }
  if (message.includes("typo in the url")) {
    return `Could not connect to ${url.origin} - check if the URL is correct`;
  }

  return `Failed to connect to ${url.origin}: ${error.message}`;
}

function isAuthError(error: unknown): boolean {
  if (error instanceof Error && "code" in error) {
    return (error as { code: number }).code === 401;
  }
  return false;
}

const NETWORK_TIMEOUT_MS = 30000; // 30 seconds

async function safeCloseTransport(transport: Transport): Promise<void> {
  try {
    const maybeClose = (transport as unknown as { close?: () => unknown })
      .close;
    if (typeof maybeClose === "function") {
      await maybeClose.call(transport);
    }
  } catch {
    // Best-effort cleanup; ignore close errors.
  }
}

async function fetchAuthDetails(
  url: URL,
): Promise<{ authHeader?: string; errorDescription?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    timeoutId.unref?.();

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      const authHeader = response.headers.get("WWW-Authenticate") ?? undefined;
      const body = await response.text();

      return { authHeader, errorDescription: body || undefined };
    } finally {
      clearTimeout(timeoutId);
    }
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

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Connection timed out after 30 seconds")),
        NETWORK_TIMEOUT_MS,
      );
      timeoutId.unref?.();
    });

    await Promise.race([connectPromise, timeoutPromise]);
    return transport;
  } catch (error) {
    await safeCloseTransport(transport);
    if (!(error instanceof UnauthorizedError) || !authProvider) {
      throw error;
    }

    // OAuth flow triggered - wait for callback and retry
    const code = await authProvider.waitForAuthorizationCode();
    const retryTransport = new TransportClass(url, { authProvider });
    try {
      await retryTransport.finishAuth(code);
      await client.connect(retryTransport);
      return retryTransport;
    } catch (retryError) {
      await safeCloseTransport(retryTransport);
      throw retryError;
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function connect(
  url: URL,
  authProvider?: CliOAuthProvider,
): Promise<{ client: Client; transport: Transport }> {
  const client = new Client({ name: "mcp-farmer", version: CLI_VERSION });

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
    if (isNetworkError(error)) {
      throw new ConnectionError(getConnectionErrorMessage(error, url));
    }
    throw error;
  }
}

export async function connectStdio(
  command: string,
  args: string[],
): Promise<{ client: Client; transport: Transport }> {
  const client = new Client({ name: "mcp-farmer", version: CLI_VERSION });
  const transport = new StdioClientTransport({ command, args });

  try {
    await client.connect(transport);
    return { client, transport };
  } catch (error) {
    await safeCloseTransport(transport);
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes("enoent") || message.includes("command not found")) {
        throw new ConnectionError(
          `Command not found: ${command}\n` +
            `Make sure the command is installed and available in your PATH.`,
        );
      }

      if (message.includes("eacces") || message.includes("permission denied")) {
        throw new ConnectionError(
          `Permission denied: ${command}\n` +
            `Make sure the command is executable.`,
        );
      }
    }

    throw error;
  }
}
