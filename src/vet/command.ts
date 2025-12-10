import { parseArgs } from "util";

import { runCheckers } from "./tools.js";
import { checkHealth } from "./health.js";
import { printHealth, printResults, printAuthError } from "./reporter.js";
import { connect, AuthenticationRequiredError } from "./mcp.js";

function printHelp() {
  console.log(`Usage: mcp-farmer vet <url> [options]

Vet an MCP server by connecting and running checks.

Arguments:
  url              The URL of the MCP server to connect to

Options:
  --output json    Output results as JSON to stdout
  --help           Show this help message

Examples:
  mcp-farmer vet http://localhost:3000/mcp
  mcp-farmer vet http://localhost:3000/mcp --output json`);
}

export async function vetCommand(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: {
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

  if (values.output && values.output !== "json") {
    console.error(`Invalid output format: ${values.output}`);
    process.exit(2);
  }

  const outputJson = values.output === "json";

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    console.error(`Invalid URL: ${url}`);
    process.exit(2);
  }

  const [connectionResult, healthResult] = await Promise.allSettled([
    connect(parsedUrl),
    checkHealth(parsedUrl),
  ]);

  if (connectionResult.status === "rejected") {
    const error = connectionResult.reason;
    if (error instanceof AuthenticationRequiredError) {
      if (outputJson) {
        console.log(
          JSON.stringify(
            {
              error: "authentication_required",
              message: error.message,
              authHeader: error.authHeader,
            },
            null,
            2,
          ),
        );
        process.exit(1);
      }

      printAuthError(error);
      process.exit(1);
    }
    throw error;
  }

  const { client, transport } = connectionResult.value;
  const health =
    healthResult.status === "fulfilled" ? healthResult.value : null;

  try {
    const serverVersion = client.getServerVersion();
    if (serverVersion) {
      console.log(`Server: ${serverVersion.name} v${serverVersion.version}`);
    }

    const startTime = performance.now();
    const { tools } = await client.listTools();
    const toolsResponseTimeMs = performance.now() - startTime;

    const findings = runCheckers(tools);

    if (outputJson) {
      console.log(
        JSON.stringify(
          {
            tools,
            health,
            findings,
            meta: { toolsResponseTimeMs },
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`Tools response time: ${toolsResponseTimeMs.toFixed(2)}ms`);
    if (health) {
      printHealth(health);
    }
    printResults(tools, findings);
  } finally {
    await transport.close();
  }
}
