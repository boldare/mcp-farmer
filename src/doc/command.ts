import { parseArgs } from "util";
import { writeFile } from "fs/promises";
import path from "path";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { connect, connectStdio, ConnectionError } from "../shared/mcp.js";
import {
  generateDocHtml,
  type DocData,
  type DocEnvVar,
  type DocHeader,
  type DocSection,
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

interface KeyValue {
  name: string;
  value: string;
}

function parseColonSeparated(
  str: string,
  fieldName: string,
  valueName: string,
): KeyValue {
  const colonIndex = str.indexOf(":");
  if (colonIndex === -1) {
    throw new Error(
      `Invalid ${fieldName} format "${str}". Expected "Name: ${valueName.toUpperCase()}"`,
    );
  }
  const name = str.slice(0, colonIndex).trim();
  const value = str.slice(colonIndex + 1).trim();
  if (!name || !value) {
    throw new Error(
      `Invalid ${fieldName} format "${str}". Both name and ${valueName} are required.`,
    );
  }
  return { name, value };
}

function parseAllColonSeparated(
  values: string[] | undefined,
  fieldName: string,
  valueName: string,
): KeyValue[] {
  const result: KeyValue[] = [];
  for (const str of values ?? []) {
    result.push(parseColonSeparated(str, fieldName, valueName));
  }
  return result;
}

async function collectKeyValuePairs(
  promptMessage: string,
  namePrompt: string,
  valuePrompt: (name: string) => string,
  logPrefix: string,
): Promise<KeyValue[]> {
  const pairs: KeyValue[] = [];

  const shouldAdd = await select({
    message: promptMessage,
    choices: [
      { name: "No", value: false },
      { name: "Yes", value: true },
    ],
  });

  if (!shouldAdd) {
    return pairs;
  }

  while (true) {
    const name = await input({
      message: namePrompt,
      validate: () => true,
    });

    if (!name || name.trim() === "") {
      break;
    }

    const value = await input({
      message: valuePrompt(name),
      default: "YOUR_API_KEY",
      validate: (val) => {
        if (!val || val.trim() === "") {
          return "Please enter a value";
        }
        return true;
      },
    });

    pairs.push({ name: name.trim(), value: value.trim() });
    log.info(`Added ${logPrefix}: ${name}: ${value}`);
  }

  return pairs;
}

function printHelp(): void {
  console.log(`Usage: mcp-farmer doc --remote <url> [options]
       mcp-farmer doc --local <command> [options]

Generate beautiful HTML documentation for an MCP server.

The first --remote or --local flag is used to connect to the server.
All provided methods are included in the generated documentation's Setup section.

Options:
  --remote <url>       Add a remote (HTTP) installation method (can be used multiple times)
  --local <command>    Add a local (stdio) installation method (can be used multiple times)
  --header <header>    Add a required header in "Name: PLACEHOLDER" format for remote servers (can be used multiple times)
  --env <env>          Add a required environment variable in "NAME: PLACEHOLDER" format for local servers (can be used multiple times)
  --section <section>  Add a custom section in "TITLE: content" format (can be used multiple times)
  --out <file>         Output file path (skips interactive prompt)
  --help               Show this help message

Examples:
  Remote server:
    mcp-farmer doc --remote https://mcp.example.com/sse
    mcp-farmer doc --remote https://mcp.example.com/sse --out docs.html

  Local server:
    mcp-farmer doc --local "npx -y @modelcontextprotocol/server-memory"
    mcp-farmer doc --local "node server.js"

  With required headers (remote):
    mcp-farmer doc --remote https://mcp.example.com/sse --header "Authorization: YOUR_TOKEN"
    mcp-farmer doc --remote https://mcp.example.com/sse --header "Authorization: YOUR_TOKEN" --header "X-API-Key: YOUR_KEY"

  With required environment variables (local):
    mcp-farmer doc --local "npx -y @example/mcp-server" --env "API_KEY: YOUR_API_KEY"
    mcp-farmer doc --local "npx -y @example/mcp-server" --env "API_KEY: YOUR_API_KEY" --env "SECRET: YOUR_SECRET"

  With custom sections:
    mcp-farmer doc --remote https://mcp.example.com/sse --section "Introduction: Welcome to our MCP server."
    mcp-farmer doc --remote https://mcp.example.com/sse --section "Introduction: About this server" --section "Features: Key features of the API"

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
        header: {
          type: "string",
          multiple: true,
        },
        env: {
          type: "string",
          multiple: true,
        },
        section: {
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

  // Parse headers, env vars, and sections from flags
  let headers: DocHeader[];
  let envVars: DocEnvVar[];
  let sections: DocSection[];

  try {
    const parsedHeaders = parseAllColonSeparated(
      values.header,
      "header",
      "placeholder",
    );
    headers = parsedHeaders.map((h) => ({
      name: h.name,
      placeholder: h.value,
    }));

    const parsedEnvVars = parseAllColonSeparated(
      values.env,
      "env",
      "placeholder",
    );
    envVars = parsedEnvVars.map((e) => ({
      name: e.name,
      placeholder: e.value,
    }));

    const parsedSections = parseAllColonSeparated(
      values.section,
      "section",
      "content",
    );
    sections = parsedSections.map((s) => ({ title: s.name, content: s.value }));
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    printHelp();
    process.exit(2);
  }

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
        const choices: { name: string; value: "remote" | "local" | "done" }[] =
          [
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

  // Track if we're in interactive mode (no flags provided)
  const isInteractiveMode =
    (values.remote ?? []).length === 0 && (values.local ?? []).length === 0;

  // Collect headers interactively only if in interactive mode, has remote methods, and none provided via flags
  const hasRemoteMethods = installMethods.some((m) => m.type === "remote");
  if (isInteractiveMode && hasRemoteMethods && headers.length === 0) {
    try {
      const collected = await collectKeyValuePairs(
        "Does the remote server require any authentication headers?",
        "Enter header name (or leave empty to finish):",
        (name) => `Enter placeholder for ${name} (e.g., YOUR_API_KEY):`,
        "header",
      );
      headers = collected.map((h) => ({ name: h.name, placeholder: h.value }));
    } catch (error) {
      handleCancel(error);
    }
  }

  // Collect env vars interactively only if in interactive mode, has local methods, and none provided via flags
  const hasLocalMethods = installMethods.some((m) => m.type === "local");
  if (isInteractiveMode && hasLocalMethods && envVars.length === 0) {
    try {
      const collected = await collectKeyValuePairs(
        "Does the local server require any environment variables?",
        "Enter environment variable name (or leave empty to finish):",
        (name) => `Enter placeholder for ${name} (e.g., YOUR_API_KEY):`,
        "env var",
      );
      envVars = collected.map((e) => ({ name: e.name, placeholder: e.value }));
    } catch (error) {
      handleCancel(error);
    }
  }

  // Collect sections interactively only if in interactive mode and none provided via flags
  if (isInteractiveMode && sections.length === 0) {
    try {
      const collected = await collectKeyValuePairs(
        "Would you like to add custom sections (e.g., Introduction, Features)?",
        "Enter section title (or leave empty to finish):",
        (title) => `Enter content for "${title}":`,
        "section",
      );
      sections = collected.map((s) => ({ title: s.name, content: s.value }));
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
    headers,
    envVars,
    sections,
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
