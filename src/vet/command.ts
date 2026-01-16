import { parseArgs } from "util";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { runCheckers } from "./tools.js";
import { checkHealth } from "./health.js";
import {
  connect,
  connectStdio,
  AuthenticationRequiredError,
  ConnectionError,
} from "../shared/mcp.js";
import { CliOAuthProvider } from "../shared/oauth.js";
import { consoleReporter } from "./reporters/console.js";
import { jsonReporter } from "./reporters/json.js";
import { htmlReporter } from "./reporters/html.js";
import { markdownReporter } from "./reporters/markdown.js";
import type { Reporter } from "./reporters/shared.js";
import type { HealthCheckResult } from "./health.js";
import {
  parseTarget,
  resolveTargetFromConfig,
  type CommandTarget,
} from "../shared/target.js";

const reporters = {
  console: consoleReporter,
  json: jsonReporter,
  html: htmlReporter,
  markdown: markdownReporter,
} as const;

async function timed<T>(
  promise: Promise<T>,
): Promise<
  { ok: true; value: T; ms: number } | { ok: false; error: unknown; ms: number }
> {
  const start = performance.now();
  try {
    const value = await promise;
    return { ok: true, value, ms: performance.now() - start };
  } catch (error) {
    return { ok: false, error, ms: performance.now() - start };
  }
}

async function runVet(
  client: Client,
  transport: Transport,
  reporter: Reporter,
  target: string,
  health: HealthCheckResult | null,
): Promise<void> {
  try {
    const serverVersion = client.getServerVersion();
    const capabilities = client.getServerCapabilities();
    const resourcesSupported = Boolean(capabilities?.resources);
    const promptsSupported = Boolean(capabilities?.prompts);

    const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
      timed(client.listTools()),
      resourcesSupported ? timed(client.listResources()) : null,
      promptsSupported ? timed(client.listPrompts()) : null,
    ]);

    const tools = toolsResult.ok ? toolsResult.value.tools : [];
    const resources =
      resourcesResult && resourcesResult.ok
        ? resourcesResult.value.resources
        : null;
    const prompts =
      promptsResult && promptsResult.ok ? promptsResult.value.prompts : null;

    const toolsResponseTimeMs = toolsResult.ok ? toolsResult.ms : 0;
    const resourcesResponseTimeMs =
      resourcesResult && resourcesResult.ok ? resourcesResult.ms : null;
    const promptsResponseTimeMs =
      promptsResult && promptsResult.ok ? promptsResult.ms : null;

    const findings = runCheckers(tools);

    const output = reporter({
      serverName: serverVersion?.name,
      serverVersion: serverVersion?.version,
      target,
      tools,
      resourcesSupported,
      promptsSupported,
      resources,
      prompts,
      findings,
      health,
      toolsResponseTimeMs,
      resourcesResponseTimeMs,
      promptsResponseTimeMs,
    });
    console.log(output);
  } finally {
    await transport.close();
  }
}

type OutputFormat = "json" | "html" | "markdown";

function printHelp() {
  console.log(`Usage: mcp-farmer vet [options]
       mcp-farmer vet <url> [options]
       mcp-farmer vet [options] -- <command> [args...]

Vet an MCP server by connecting and running checks.

Arguments:
  url                  The URL of the MCP server to connect to (HTTP mode)
  command              The command to spawn (stdio mode, after --)

Options:
  --config <path>      Path to MCP config file (e.g., .cursor/mcp.json)
  --output json|html|markdown   Output format (json, html, or markdown)
  --oauth              Enable OAuth authentication flow (HTTP mode only)
  --oauth-port <port>  Port for OAuth callback server (default: 9876)
  --help               Show this help message

Examples:
  Auto-detect from config:
    mcp-farmer vet
    mcp-farmer vet --config .cursor/mcp.json

  HTTP mode:
    mcp-farmer vet http://localhost:3000/mcp
    mcp-farmer vet http://localhost:3000/mcp --output json
    mcp-farmer vet http://localhost:3000/mcp --output html > report.html
    mcp-farmer vet http://localhost:3000/mcp --output markdown > report.md
    mcp-farmer vet https://secure-server.com/mcp --oauth

  Stdio mode:
    mcp-farmer vet -- node server.js
    mcp-farmer vet -- npx -y @modelcontextprotocol/server-memory
    mcp-farmer vet --output json -- python mcp_server.py`);
}

export async function vetCommand(args: string[]) {
  const { target, remainingArgs } = parseTarget(args);

  let values;
  try {
    const parsed = parseArgs({
      args: remainingArgs,
      options: {
        config: {
          short: "c",
          type: "string",
        },
        output: {
          short: "o",
          type: "string",
        },
        oauth: {
          type: "boolean",
        },
        "oauth-port": {
          type: "string",
        },
        help: {
          short: "h",
          type: "boolean",
        },
      },
      strict: true,
      allowPositionals: true,
    });
    values = parsed.values;
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    printHelp();
    process.exit(2);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  let resolvedTarget: CommandTarget | null = target;

  if (!resolvedTarget) {
    resolvedTarget = await resolveTargetFromConfig(
      values.config,
      "Select an MCP server to vet:",
    );
  }

  if (!resolvedTarget) {
    if (values.config) {
      console.error(`No MCP servers found in config file: ${values.config}\n`);
    } else {
      console.error(
        "Error: No MCP servers found. Provide a URL, command, or config file.\n",
      );
    }
    printHelp();
    process.exit(2);
  }

  if (
    values.output &&
    values.output !== "json" &&
    values.output !== "html" &&
    values.output !== "markdown"
  ) {
    console.error(
      `Invalid output format: ${values.output}. Use 'json', 'html', or 'markdown'.`,
    );
    process.exit(2);
  }

  const outputFormat = values.output as OutputFormat | undefined;
  const reporter = reporters[outputFormat ?? "console"];

  if (resolvedTarget.mode === "stdio") {
    if (values.oauth) {
      console.error("OAuth is not supported for stdio servers");
      process.exit(2);
    }

    const targetDisplay = [resolvedTarget.command, ...resolvedTarget.args].join(
      " ",
    );
    const { client, transport } = await connectStdio(
      resolvedTarget.command,
      resolvedTarget.args,
    );

    await runVet(client, transport, reporter, targetDisplay, null);
    return;
  }

  // HTTP mode
  let oauthPort = 9876;
  if (values["oauth-port"]) {
    oauthPort = parseInt(values["oauth-port"], 10);
    if (isNaN(oauthPort) || oauthPort < 1 || oauthPort > 65535) {
      console.error(`Invalid OAuth port: ${values["oauth-port"]}`);
      process.exit(2);
    }
  }

  const authProvider = values.oauth
    ? new CliOAuthProvider(oauthPort)
    : undefined;

  const [connectionResult, healthResult] = await Promise.allSettled([
    connect(resolvedTarget.url, authProvider),
    checkHealth(resolvedTarget.url),
  ]);

  if (connectionResult.status === "rejected") {
    const error = connectionResult.reason;
    if (error instanceof AuthenticationRequiredError) {
      const output = reporter({
        target: resolvedTarget.url.toString(),
        tools: [],
        resourcesSupported: false,
        promptsSupported: false,
        resources: null,
        prompts: null,
        findings: [],
        health: null,
        toolsResponseTimeMs: 0,
        resourcesResponseTimeMs: null,
        promptsResponseTimeMs: null,
        authError: {
          message: error.message,
          authHeader: error.authHeader,
        },
      });
      console.log(output);
      process.exit(1);
    }
    if (error instanceof ConnectionError) {
      console.error(`Error: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }

  const { client, transport } = connectionResult.value;
  const health =
    healthResult.status === "fulfilled" ? healthResult.value : null;

  await runVet(
    client,
    transport,
    reporter,
    resolvedTarget.url.toString(),
    health,
  );
}
