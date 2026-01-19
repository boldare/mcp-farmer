import { parseArgs } from "util";
import { writeFile } from "fs/promises";
import path from "path";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { connect, connectStdio, ConnectionError } from "../shared/mcp.js";
import {
  generateDocHtml,
  type DocData,
  type InstallMethod,
} from "./html.js";
import {
  intro,
  outro,
  spinner,
  input,
  select,
  log,
  handleCancel,
} from "../shared/prompts.js";

function printHelp(): void {
  console.log(`Usage: mcp-farmer doc --remote <url> [options]
       mcp-farmer doc --local <command> [options]

Generate beautiful HTML documentation for an MCP server.

The first --remote or --local flag is used to connect to the server.
All provided methods are included in the generated documentation's Setup section.

Options:
  --remote <url>       Add a remote (HTTP) installation method (can be used multiple times)
  --local <command>    Add a local (stdio) installation method (can be used multiple times)
  --out <file>         Output file path (skips interactive prompt)
  --help               Show this help message

Examples:
  Remote server:
    mcp-farmer doc --remote https://mcp.example.com/sse
    mcp-farmer doc --remote https://mcp.example.com/sse --out docs.html

  Local server:
    mcp-farmer doc --local "npx -y @modelcontextprotocol/server-memory"
    mcp-farmer doc --local "node server.js"

  Multiple installation methods:
    mcp-farmer doc --remote https://prod.example.com --local "npx -y @example/mcp-server"

  Interactive mode (will prompt for installation methods):
    mcp-farmer doc`);
}

async function generateDoc(
  client: Client,
  transport: Transport,
  target: string,
): Promise<DocData> {
  try {
    const serverVersion = client.getServerVersion();

    const [toolsResult, resourcesResult, promptsResult] =
      await Promise.allSettled([
        client.listTools(),
        client.listResources(),
        client.listPrompts(),
      ]);

    const tools =
      toolsResult.status === "fulfilled" ? toolsResult.value.tools : [];
    const resources =
      resourcesResult.status === "fulfilled"
        ? resourcesResult.value.resources
        : [];
    const prompts =
      promptsResult.status === "fulfilled" ? promptsResult.value.prompts : [];

    return {
      serverName: serverVersion?.name,
      serverVersion: serverVersion?.version,
      target,
      tools,
      resources,
      prompts,
    };
  } finally {
    await transport.close();
  }
}

export async function docCommand(args: string[]) {
  let values;
  try {
    const parsed = parseArgs({
      args,
      options: {
        out: {
          short: "o",
          type: "string",
        },
        remote: {
          type: "string",
          multiple: true,
        },
        local: {
          type: "string",
          multiple: true,
        },
        help: {
          short: "h",
          type: "boolean",
        },
      },
      strict: true,
      allowPositionals: false,
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

  intro("MCP Documentation Generator");

  // Collect install methods from flags
  const installMethods: InstallMethod[] = [];

  for (const url of values.remote ?? []) {
    installMethods.push({ type: "remote", value: url });
  }

  for (const command of values.local ?? []) {
    installMethods.push({ type: "local", value: command });
  }

  // Interactive prompt for adding install methods if none provided via flags
  if (installMethods.length === 0) {
    try {
      log.info("No installation methods provided. Let's add at least one.");

      while (true) {
        const isFirst = installMethods.length === 0;
        const choices: { name: string; value: "remote" | "local" | "done" }[] = [
          { name: "Remote (HTTP/SSE URL)", value: "remote" },
          { name: "Local (stdio command)", value: "local" },
        ];

        // Only show "Done" option if at least one method has been added
        if (!isFirst) {
          choices.push({ name: "Done adding methods", value: "done" });
        }

        const methodType = await select({
          message: isFirst
            ? "Select installation method type (required):"
            : "Add another installation method:",
          choices,
        });

        if (methodType === "done") {
          break;
        }

        const placeholder =
          methodType === "remote"
            ? "https://mcp.example.com/sse"
            : "npx -y @example/mcp-server";

        const methodValue = await input({
          message:
            methodType === "remote"
              ? "Enter the remote URL:"
              : "Enter the local command:",
          validate: (val) => {
            if (!val || val.trim() === "") {
              return "Please enter a value";
            }
            return true;
          },
          default: placeholder,
        });

        installMethods.push({ type: methodType, value: methodValue });

        log.info(`Added ${methodType} method: ${methodValue}`);
      }
    } catch (error) {
      handleCancel(error);
    }
  }

  // Use the first install method to connect to the server
  const connectionTarget = installMethods[0];
  if (!connectionTarget) {
    console.error("Error: At least one installation method is required\n");
    printHelp();
    process.exit(2);
  }

  const s = spinner();
  s.start("Connecting to server...");

  let client: Client;
  let transport: Transport;
  let targetDisplay: string;

  try {
    if (connectionTarget.type === "local") {
      // Parse the command string into command and args
      const parts = connectionTarget.value.split(/\s+/).filter(Boolean);
      const command = parts[0];
      if (!command) {
        throw new ConnectionError("Invalid local command: command is empty");
      }
      const commandArgs = parts.slice(1);
      targetDisplay = connectionTarget.value;
      const connection = await connectStdio(command, commandArgs);
      client = connection.client;
      transport = connection.transport;
    } else {
      targetDisplay = connectionTarget.value;
      const connection = await connect(new URL(connectionTarget.value));
      client = connection.client;
      transport = connection.transport;
    }

    s.stop("Connected");
  } catch (error) {
    s.stop("Connection failed");
    if (error instanceof ConnectionError) {
      console.error(`Error: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }

  s.start("Fetching server capabilities...");

  const docData = await generateDoc(client, transport, targetDisplay);

  s.stop(
    `Found ${docData.tools.length} tools, ${docData.resources.length} resources, ${docData.prompts.length} prompts`,
  );

  // Determine output path
  let outputPath = values.out;

  if (!outputPath) {
    try {
      const defaultName = docData.serverName
        ? `${docData.serverName.toLowerCase().replace(/\s+/g, "-")}-docs.html`
        : "mcp-docs.html";

      outputPath = await input({
        message: "Where should the documentation be saved?",
        default: defaultName,
        validate: (val) => {
          if (!val || val.trim() === "") {
            return "Please enter a file path";
          }
          if (!val.endsWith(".html")) {
            return "File path should end with .html";
          }
          return true;
        },
      });
    } catch (error) {
      handleCancel(error);
    }
  }

  if (!outputPath) {
    console.error("Error: No output path provided");
    process.exit(2);
  }

  s.start("Generating documentation...");

  const html = generateDocHtml({
    ...docData,
    installMethods,
  });
  const absolutePath = path.resolve(outputPath);

  await writeFile(absolutePath, html, "utf-8");

  s.stop("Documentation generated");

  outro(`Documentation saved to ${absolutePath}`);

  log.message(
    `Open in browser:\n  file://${absolutePath}\n\nWhat's next?\n  mcp-farmer vet   Run quality checks\n  mcp-farmer try   Test tools interactively`,
  );

  process.exit(0);
}
