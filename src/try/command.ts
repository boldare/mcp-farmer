import { parseArgs } from "util";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { connect, connectStdio, ConnectionError } from "../shared/mcp.js";
import {
  extractToolSchema,
  getPropertyType,
  formatType,
} from "../shared/schema.js";
import { parseTarget } from "../shared/target.js";
import {
  search,
  select,
  input,
  spinner,
  intro,
  outro,
  note,
  log,
  handleCancel,
} from "../shared/prompts.js";

type CapabilityType = "tools" | "resources";

function printHelp(): void {
  console.log(`Usage: mcp-farmer try <url> [options]
       mcp-farmer try [options] -- <command> [args...]

Interactively call tools or read resources on an MCP server.

Arguments:
  url                  The URL of the MCP server to connect to (HTTP mode)
  command              The command to spawn (stdio mode, after --)

Options:
  --help               Show this help message

Examples:
  HTTP mode:
    mcp-farmer try http://localhost:3000/mcp

  Stdio mode:
    mcp-farmer try -- node server.js
    mcp-farmer try -- npx -y @modelcontextprotocol/server-memory`);
}

function parseInputValue(value: string, type: string): unknown {
  if (value === "") {
    return undefined;
  }

  switch (type) {
    case "number":
    case "integer":
      return Number(value);
    case "boolean":
      return value.toLowerCase() === "true";
    case "object":
    case "array":
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}

function formatToolResult(result: {
  content: { type: string; text?: string; [key: string]: unknown }[];
  structuredContent?: unknown;
}): string {
  if (result.structuredContent) {
    return JSON.stringify(result.structuredContent, null, 2);
  }

  const textParts = result.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text);

  if (textParts.length > 0) {
    return textParts.join("\n");
  }

  return JSON.stringify(result.content, null, 2);
}

function formatResourceResult(result: {
  contents: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }[];
}): string {
  const parts: string[] = [];

  for (const content of result.contents) {
    if (content.text) {
      parts.push(content.text);
    } else if (content.blob) {
      parts.push(`[Binary data: ${content.blob.length} bytes base64]`);
    }
  }

  if (parts.length > 0) {
    return parts.join("\n---\n");
  }

  return JSON.stringify(result.contents, null, 2);
}

async function runToolTry(client: Client): Promise<void> {
  const { tools } = await client.listTools();

  if (tools.length === 0) {
    log.warn("No tools available on this server.");
    return;
  }

  try {
    // Use search prompt for tool selection (enhanced UX)
    const selectedTool = await search({
      message: "Select a tool to call:",
      source: async (term) => {
        const filtered = tools.filter(
          (t) =>
            !term ||
            t.name.toLowerCase().includes(term.toLowerCase()) ||
            t.description?.toLowerCase().includes(term.toLowerCase()),
        );
        return filtered.map((tool) => ({
          value: tool,
          name: tool.name,
          description: tool.description,
        }));
      },
    });

    const { properties, required, propNames } = extractToolSchema(selectedTool);

    const args: Record<string, unknown> = {};

    for (const propName of propNames) {
      const prop = properties[propName];
      if (!prop) continue;
      const isRequired = required.has(propName);
      const type = getPropertyType(prop);
      const hint = prop.description ?? "";
      const requiredLabel = isRequired ? " (required)" : " (optional)";
      const formattedType = formatType(prop);
      const typeLabel = formattedType !== "string" ? ` [${formattedType}]` : "";

      const value = await input({
        message: `${propName}${requiredLabel}${typeLabel}${hint ? ` - ${hint}` : ""}`,
        validate: isRequired
          ? (val) => {
              if (!val || val.trim() === "") {
                return `${propName} is required`;
              }
              return true;
            }
          : undefined,
      });

      const parsed = parseInputValue(value, type);
      if (parsed !== undefined) {
        args[propName] = parsed;
      }
    }

    const s = spinner();
    s.start(`Calling ${selectedTool.name}...`);

    try {
      const result = await client.callTool({
        name: selectedTool.name,
        arguments: args,
      });

      s.stop(`${selectedTool.name} completed`);

      const formatted = formatToolResult(
        result as {
          content: {
            type: string;
            text?: string;
            [key: string]: unknown;
          }[];
          structuredContent?: unknown;
        },
      );
      note(formatted, "Result");
    } catch (error) {
      s.stop(`${selectedTool.name} failed`);
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Tool error: ${message}`);
    }
  } catch (error) {
    handleCancel(error);
  }
}

async function runResourceTry(client: Client): Promise<void> {
  const { resources } = await client.listResources();

  if (resources.length === 0) {
    log.warn("No resources available on this server.");
    return;
  }

  try {
    const selectedResource = await select({
      message: "Select a resource to read:",
      choices: resources.map((resource) => ({
        value: resource,
        name: resource.name ?? resource.uri,
        description: resource.description ?? resource.uri,
      })),
    });

    const s = spinner();
    s.start(`Reading ${selectedResource.name ?? selectedResource.uri}...`);

    try {
      const result = await client.readResource({
        uri: selectedResource.uri,
      });

      s.stop(`${selectedResource.name ?? selectedResource.uri} read`);

      const formatted = formatResourceResult(
        result as {
          contents: {
            uri: string;
            mimeType?: string;
            text?: string;
            blob?: string;
          }[];
        },
      );
      note(formatted, "Resource Content");
    } catch (error) {
      s.stop(`${selectedResource.name ?? selectedResource.uri} failed`);
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Resource error: ${message}`);
    }
  } catch (error) {
    handleCancel(error);
  }
}

async function detectCapabilities(
  client: Client,
): Promise<{ hasTools: boolean; hasResources: boolean }> {
  const [toolsResult, resourcesResult] = await Promise.all([
    client.listTools().catch(() => ({ tools: [] })),
    client.listResources().catch(() => ({ resources: [] })),
  ]);

  return {
    hasTools: toolsResult.tools.length > 0,
    hasResources: resourcesResult.resources.length > 0,
  };
}

async function runTry(client: Client, transport: Transport): Promise<void> {
  try {
    const { hasTools, hasResources } = await detectCapabilities(client);

    if (!hasTools && !hasResources) {
      log.warn("No tools or resources available on this server.");
      return;
    }

    let capabilityType: CapabilityType;

    if (hasTools && hasResources) {
      try {
        const selected = await select({
          message: "What would you like to try?",
          choices: [
            {
              value: "tools" as const,
              name: "Tools",
              description: "Call a tool",
            },
            {
              value: "resources" as const,
              name: "Resources",
              description: "Read a resource",
            },
          ],
        });

        capabilityType = selected;
      } catch (error) {
        handleCancel(error);
      }
    } else {
      capabilityType = hasTools ? "tools" : "resources";
    }

    if (capabilityType === "tools") {
      await runToolTry(client);
    } else {
      await runResourceTry(client);
    }
  } finally {
    await transport.close();
  }
}

export async function tryCommand(args: string[]) {
  const { target, remainingArgs } = parseTarget(args);

  let values;
  try {
    const parsed = parseArgs({
      args: remainingArgs,
      options: {
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

  if (!target) {
    console.error("Error: URL or command is required\n");
    printHelp();
    process.exit(2);
  }

  intro("MCP Tool Runner");

  const s = spinner();
  s.start("Connecting to server...");

  try {
    let client: Client;
    let transport: Transport;

    if (target.mode === "stdio") {
      const connection = await connectStdio(target.command, target.args);
      client = connection.client;
      transport = connection.transport;
    } else {
      const connection = await connect(target.url);
      client = connection.client;
      transport = connection.transport;
    }

    s.stop("Connected");

    await runTry(client, transport);

    outro("MCP Tool Runner completed");

    log.message(`What's next?\n` + `  mcp-farmer vet   Get a full report`);

    process.exit(0);
  } catch (error) {
    s.stop("Connection failed");
    if (error instanceof ConnectionError) {
      console.error(`Error: ${error.message}`);
      process.exit(2);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}
