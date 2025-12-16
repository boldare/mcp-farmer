import { parseArgs } from "util";
import * as p from "@clack/prompts";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { connect, connectStdio } from "../shared/mcp.js";
import {
  extractToolSchema,
  getPropertyType,
  formatType,
} from "../shared/schema.js";

interface StdioTarget {
  mode: "stdio";
  command: string;
  args: string[];
}

interface HttpTarget {
  mode: "http";
  url: URL;
}

type TryTarget = StdioTarget | HttpTarget;

function printHelp(): void {
  console.log(`Usage: mcp-farmer try <url> [options]
       mcp-farmer try [options] -- <command> [args...]

Interactively call a tool on an MCP server.

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

function parseTarget(args: string[]): {
  target: TryTarget | null;
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

function formatResult(result: {
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

async function runTry(client: Client, transport: Transport): Promise<void> {
  try {
    const { tools } = await client.listTools();

    if (tools.length === 0) {
      p.log.warn("No tools available on this server.");
      return;
    }

    const selectedTool = await p.select({
      message: "Select a tool to call:",
      options: tools.map((tool) => ({
        value: tool,
        label: tool.name,
        hint: tool.description,
      })),
    });

    if (p.isCancel(selectedTool)) {
      p.cancel("Operation cancelled.");
      return;
    }

    const { properties, required, propNames } = extractToolSchema(selectedTool);

    const args: Record<string, unknown> = {};

    for (const name of propNames) {
      const prop = properties[name];
      if (!prop) continue;
      const isRequired = required.has(name);
      const type = getPropertyType(prop);
      const hint = prop.description ?? "";
      const requiredLabel = isRequired ? " (required)" : " (optional)";
      const formattedType = formatType(prop);
      const typeLabel = formattedType !== "string" ? ` [${formattedType}]` : "";

      const value = await p.text({
        message: `${name}${requiredLabel}${typeLabel}`,
        placeholder: hint,
        validate: isRequired
          ? (val) => {
              if (!val || val.trim() === "") {
                return `${name} is required`;
              }
            }
          : undefined,
      });

      if (p.isCancel(value)) {
        p.cancel("Operation cancelled.");
        return;
      }

      const parsed = parseInputValue(value, type);
      if (parsed !== undefined) {
        args[name] = parsed;
      }
    }

    const s = p.spinner();
    s.start(`Calling ${selectedTool.name}...`);

    try {
      const result = await client.callTool({
        name: selectedTool.name,
        arguments: args,
      });

      s.stop(`${selectedTool.name} completed`);

      const formatted = formatResult(
        result as {
          content: {
            type: string;
            text?: string;
            [key: string]: unknown;
          }[];
          structuredContent?: unknown;
        },
      );
      p.note(formatted, "Result");
    } catch (error) {
      s.stop(`${selectedTool.name} failed`);
      const message = error instanceof Error ? error.message : String(error);
      p.log.error(`Tool error: ${message}`);
    }
  } finally {
    await transport.close();
  }
}

export async function tryCommand(args: string[]) {
  const { target, remainingArgs } = parseTarget(args);

  const { values } = parseArgs({
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

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (!target) {
    console.error("Error: URL or command is required\n");
    printHelp();
    process.exit(2);
  }

  p.intro("MCP Tool Runner");

  const s = p.spinner();
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

    p.outro("Done");
  } catch (error) {
    s.stop("Connection failed");
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}
