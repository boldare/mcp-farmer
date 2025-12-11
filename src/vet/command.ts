import { parseArgs } from "util";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { runCheckers } from "./tools.js";
import { checkHealth } from "./health.js";
import { connect, connectStdio, AuthenticationRequiredError } from "./mcp.js";
import { CliOAuthProvider } from "./oauth.js";
import { consoleReporter } from "./reporters/console.js";
import { jsonReporter } from "./reporters/json.js";
import { htmlReporter } from "./reporters/html.js";
import type { Reporter } from "./reporters/shared.js";
import type { HealthCheckResult } from "./health.js";

const reporters = {
  console: consoleReporter,
  json: jsonReporter,
  html: htmlReporter,
} as const;

async function runVet(
  client: Client,
  transport: Transport,
  reporter: Reporter,
  target: string,
  health: HealthCheckResult | null,
): Promise<void> {
  try {
    const serverVersion = client.getServerVersion();

    const startTime = performance.now();
    const { tools } = await client.listTools();
    const toolsResponseTimeMs = performance.now() - startTime;

    const findings = runCheckers(tools);

    const output = reporter({
      serverName: serverVersion?.name,
      serverVersion: serverVersion?.version,
      target,
      tools,
      findings,
      health,
      toolsResponseTimeMs,
    });
    console.log(output);
  } finally {
    await transport.close();
  }
}

type OutputFormat = "json" | "html";

function printHelp() {
  console.log(`Usage: mcp-farmer vet <url> [options]
       mcp-farmer vet [options] -- <command> [args...]

Vet an MCP server by connecting and running checks.

Arguments:
  url                  The URL of the MCP server to connect to (HTTP mode)
  command              The command to spawn (stdio mode, after --)

Options:
  --output json|html   Output format (json or html)
  --oauth              Enable OAuth authentication flow (HTTP mode only)
  --oauth-port <port>  Port for OAuth callback server (default: 9876)
  --help               Show this help message

Examples:
  HTTP mode:
    mcp-farmer vet http://localhost:3000/mcp
    mcp-farmer vet http://localhost:3000/mcp --output json
    mcp-farmer vet http://localhost:3000/mcp --output html > report.html
    mcp-farmer vet https://secure-server.com/mcp --oauth

  Stdio mode:
    mcp-farmer vet -- node server.js
    mcp-farmer vet -- npx -y @modelcontextprotocol/server-memory
    mcp-farmer vet --output json -- python mcp_server.py`);
}

interface StdioTarget {
  mode: "stdio";
  command: string;
  args: string[];
}
interface HttpTarget {
  mode: "http";
  url: URL;
}
type VetTarget = StdioTarget | HttpTarget;

function parseTarget(args: string[]): {
  target: VetTarget | null;
  remainingArgs: string[];
} {
  const separatorIndex = args.indexOf("--");

  if (separatorIndex !== -1) {
    const beforeSeparator = args.slice(0, separatorIndex);
    const afterSeparator = args.slice(separatorIndex + 1);

    const command = afterSeparator[0];
    if (!command) {
      return { target: null, remainingArgs: beforeSeparator };
    }

    const commandArgs = afterSeparator.slice(1);
    return {
      target: { mode: "stdio", command, args: commandArgs },
      remainingArgs: beforeSeparator,
    };
  }

  // No separator - look for URL in positionals
  const firstNonOption = args.find((arg) => !arg.startsWith("-"));
  if (!firstNonOption) {
    return { target: null, remainingArgs: args };
  }

  try {
    const url = new URL(firstNonOption);
    const remainingArgs = args.filter((arg) => arg !== firstNonOption);
    return { target: { mode: "http", url }, remainingArgs };
  } catch {
    return { target: null, remainingArgs: args };
  }
}

export async function vetCommand(args: string[]) {
  const { target, remainingArgs } = parseTarget(args);

  const { values } = parseArgs({
    args: remainingArgs,
    options: {
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

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (!target) {
    console.error("Error: URL or command is required\n");
    printHelp();
    process.exit(2);
  }

  if (values.output && values.output !== "json" && values.output !== "html") {
    console.error(
      `Invalid output format: ${values.output}. Use 'json' or 'html'.`,
    );
    process.exit(2);
  }

  const outputFormat = values.output as OutputFormat | undefined;
  const reporter = reporters[outputFormat ?? "console"];

  if (target.mode === "stdio") {
    if (values.oauth) {
      console.error("OAuth is not supported for stdio servers");
      process.exit(2);
    }

    const targetDisplay = [target.command, ...target.args].join(" ");
    const { client, transport } = await connectStdio(
      target.command,
      target.args,
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
    connect(target.url, authProvider),
    checkHealth(target.url),
  ]);

  if (connectionResult.status === "rejected") {
    const error = connectionResult.reason;
    if (error instanceof AuthenticationRequiredError) {
      const output = reporter({
        target: target.url.toString(),
        tools: [],
        findings: [],
        health: null,
        toolsResponseTimeMs: 0,
        authError: {
          message: error.message,
          authHeader: error.authHeader,
        },
      });
      console.log(output);
      process.exit(1);
    }
    throw error;
  }

  const { client, transport } = connectionResult.value;
  const health =
    healthResult.status === "fulfilled" ? healthResult.value : null;

  await runVet(client, transport, reporter, target.url.toString(), health);
}
