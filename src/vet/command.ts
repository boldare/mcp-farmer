import { parseArgs } from "util";

import { runCheckers } from "./tools.js";
import { checkHealth } from "./health.js";
import { connect, AuthenticationRequiredError } from "./mcp.js";
import { CliOAuthProvider } from "./oauth.js";
import { consoleReporter } from "./reporters/console.js";
import { jsonReporter } from "./reporters/json.js";
import { htmlReporter } from "./reporters/html.js";

const reporters = {
  console: consoleReporter,
  json: jsonReporter,
  html: htmlReporter,
} as const;

type OutputFormat = "json" | "html";

function printHelp() {
  console.log(`Usage: mcp-farmer vet <url> [options]

Vet an MCP server by connecting and running checks.

Arguments:
  url                  The URL of the MCP server to connect to

Options:
  --output json|html   Output format (json or html)
  --oauth              Enable OAuth authentication flow
  --oauth-port <port>  Port for OAuth callback server (default: 9876)
  --help               Show this help message

Examples:
  mcp-farmer vet http://localhost:3000/mcp
  mcp-farmer vet http://localhost:3000/mcp --output json
  mcp-farmer vet http://localhost:3000/mcp --output html > report.html
  mcp-farmer vet https://secure-server.com/mcp --oauth`);
}

export async function vetCommand(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: {
        type: "string",
      },
      oauth: {
        type: "boolean",
      },
      "oauth-port": {
        type: "string",
      },
      help: {
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

  const url = positionals[0];

  if (!url) {
    console.error("Error: URL is required\n");
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

  let oauthPort = 9876;
  if (values["oauth-port"]) {
    oauthPort = parseInt(values["oauth-port"], 10);
    if (isNaN(oauthPort) || oauthPort < 1 || oauthPort > 65535) {
      console.error(`Invalid OAuth port: ${values["oauth-port"]}`);
      process.exit(2);
    }
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    console.error(`Invalid URL: ${url}`);
    process.exit(2);
  }

  const authProvider = values.oauth
    ? new CliOAuthProvider(oauthPort)
    : undefined;

  const [connectionResult, healthResult] = await Promise.allSettled([
    connect(parsedUrl, authProvider),
    checkHealth(parsedUrl),
  ]);

  if (connectionResult.status === "rejected") {
    const error = connectionResult.reason;
    if (error instanceof AuthenticationRequiredError) {
      const output = reporter({
        url,
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

  try {
    const serverVersion = client.getServerVersion();

    const startTime = performance.now();
    const { tools } = await client.listTools();
    const toolsResponseTimeMs = performance.now() - startTime;

    const findings = runCheckers(tools);

    const output = reporter({
      serverName: serverVersion?.name,
      serverVersion: serverVersion?.version,
      url,
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
