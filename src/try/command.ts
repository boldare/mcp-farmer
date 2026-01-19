import { parseArgs } from "util";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import chalk from "chalk";

import { connect, connectStdio, ConnectionError } from "../shared/mcp.js";
import {
  extractToolSchema,
  getPropertyType,
  formatType,
} from "../shared/schema.js";
import { parseTarget } from "../shared/target.js";
import {
  search,
  input,
  spinner,
  intro,
  outro,
  note,
  log,
  handleCancel,
} from "../shared/prompts.js";

interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

interface PromptDefinition {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

interface ResourceDefinition {
  uri: string;
  name?: string;
  description?: string;
}

type TryItemType = "tool" | "resource" | "prompt";

type TryItem =
  | {
      type: "tool";
      name: string;
      description?: string;
      tool: Tool;
    }
  | {
      type: "resource";
      name: string;
      description?: string;
      resource: ResourceDefinition;
    }
  | {
      type: "prompt";
      name: string;
      description?: string;
      prompt: PromptDefinition;
    };

const tryItemOrder: Record<TryItemType, number> = {
  tool: 0,
  resource: 1,
  prompt: 2,
};

const tryItemLabelColor: Record<TryItemType, (label: string) => string> = {
  tool: (label) => chalk.cyan(label),
  resource: (label) => chalk.yellow(label),
  prompt: (label) => chalk.magenta(label),
};

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

function formatTryItemName(item: TryItem): string {
  const label = `[${item.type}]`;
  const colorize = tryItemLabelColor[item.type];
  return `${colorize(label)} ${item.name}`;
}

function sortTryItems(items: TryItem[]): TryItem[] {
  return [...items].sort((a, b) => {
    const typeDelta = tryItemOrder[a.type] - tryItemOrder[b.type];
    if (typeDelta !== 0) return typeDelta;
    return a.name.localeCompare(b.name);
  });
}

export function matchesTerm(item: TryItem, term: string | undefined): boolean {
  if (!term) return true;
  const lowered = term.toLowerCase();
  const description = item.description?.toLowerCase();
  return (
    item.name.toLowerCase().includes(lowered) ||
    (description ? description.includes(lowered) : false)
  );
}

async function tryTool(client: Client, tool: Tool): Promise<void> {
  const { properties, required, propNames } = extractToolSchema(tool);
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
  s.start(`Calling ${tool.name}...`);

  try {
    const result = await client.callTool({
      name: tool.name,
      arguments: args,
    });

    s.stop(`${tool.name} completed`);

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
    s.stop(`${tool.name} failed`);
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Tool error: ${message}`);
  }
}

async function tryResource(
  client: Client,
  resource: ResourceDefinition,
): Promise<void> {
  const s = spinner();
  s.start(`Reading ${resource.name ?? resource.uri}...`);

  try {
    const result = await client.readResource({
      uri: resource.uri,
    });

    s.stop(`${resource.name ?? resource.uri} read`);

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
    s.stop(`${resource.name ?? resource.uri} failed`);
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Resource error: ${message}`);
  }
}

async function tryPrompt(
  client: Client,
  prompt: PromptDefinition,
): Promise<void> {
  const args: Record<string, string> = {};
  const promptArgs = prompt.arguments ?? [];

  for (const arg of promptArgs) {
    const requiredLabel = arg.required ? " (required)" : " (optional)";
    const hint = arg.description ?? "";
    const value = await input({
      message: `${arg.name}${requiredLabel}${hint ? ` - ${hint}` : ""}`,
      validate: arg.required
        ? (val) => {
            if (!val || val.trim() === "") {
              return `${arg.name} is required`;
            }
            return true;
          }
        : undefined,
    });

    if (value && value.trim() !== "") {
      args[arg.name] = value;
    }
  }

  const s = spinner();
  s.start(`Building ${prompt.name}...`);

  try {
    const result = await client.getPrompt({
      name: prompt.name,
      arguments: args,
    });

    s.stop(`${prompt.name} completed`);

    note(JSON.stringify(result, null, 2), "Prompt Output");
  } catch (error) {
    s.stop(`${prompt.name} failed`);
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Prompt error: ${message}`);
  }
}

async function runTry(client: Client, transport: Transport): Promise<void> {
  try {
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

    const items: TryItem[] = [
      ...tools.map((tool) => ({
        type: "tool" as const,
        name: tool.name,
        description: tool.description,
        tool,
      })),
      ...resources.map((resource) => ({
        type: "resource" as const,
        name: resource.name ?? resource.uri,
        description: resource.description ?? resource.uri,
        resource,
      })),
      ...prompts.map((prompt) => ({
        type: "prompt" as const,
        name: prompt.name,
        description: prompt.description,
        prompt,
      })),
    ];

    if (items.length === 0) {
      log.warn("No tools, resources, or prompts available on this server.");
      return;
    }

    const sortedItems = sortTryItems(items);

    try {
      const selectedItem = await search({
        message: "Search for an item to try:",
        source: async (term) => {
          const filtered = sortedItems.filter((item) =>
            matchesTerm(item, term),
          );
          return filtered.map((item) => ({
            value: item,
            name: formatTryItemName(item),
            description: item.description,
          }));
        },
      });

      if (selectedItem.type === "tool") {
        await tryTool(client, selectedItem.tool);
      } else if (selectedItem.type === "resource") {
        await tryResource(client, selectedItem.resource);
      } else {
        await tryPrompt(client, selectedItem.prompt);
      }
    } catch (error) {
      handleCancel(error);
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
