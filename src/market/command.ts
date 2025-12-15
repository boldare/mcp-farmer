import * as p from "@clack/prompts";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { servers } from "./servers.js";
import { mcpClients } from "./clients.js";

interface PackageRunner {
  name: string;
  command: string;
  args: string[];
  label: string;
  hint: string;
}

const runners: PackageRunner[] = [
  {
    name: "npx",
    command: "npx",
    args: ["-y"],
    label: "npx",
    hint: "Node.js (comes with npm)",
  },
  {
    name: "bunx",
    command: "bunx",
    args: [],
    label: "bunx",
    hint: "Bun runtime",
  },
  {
    name: "pnpm dlx",
    command: "pnpm",
    args: ["dlx"],
    label: "pnpm dlx",
    hint: "pnpm package manager",
  },
  {
    name: "yarn dlx",
    command: "yarn",
    args: ["dlx"],
    label: "yarn dlx",
    hint: "Yarn package manager",
  },
];

function normalizeServerName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function getConfigKey(clientId: string): "mcpServers" | "servers" {
  return clientId === "vscode" ? "servers" : "mcpServers";
}

interface McpServerConfig {
  command?: string;
  args?: string[];
  url?: string;
  type?: "http" | "stdio";
}

function buildServerConfig(
  runner: PackageRunner | undefined,
  packageName?: string,
  url?: string,
): McpServerConfig {
  if (url) {
    return { url, type: "http" };
  }

  if (!runner || !packageName) {
    throw new Error(
      "Runner and packageName are required for package-based servers",
    );
  }

  return {
    command: runner.command,
    args: [...runner.args, packageName],
  };
}

export async function saveServerConfig(
  configPath: string,
  serverName: string,
  serverConfig: McpServerConfig,
  configKey: "mcpServers" | "servers",
): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });

  let existingConfig;
  try {
    const content = await readFile(configPath, "utf-8");
    existingConfig = JSON.parse(content);
  } catch {
    existingConfig = {};
  }

  const existingServers = existingConfig[configKey] ?? {};

  const updatedConfig = {
    ...existingConfig,
    [configKey]: {
      ...existingServers,
      [serverName]: serverConfig,
    },
  };

  await writeFile(configPath, JSON.stringify(updatedConfig, null, 2));
}

function printHelp() {
  console.log(`Usage: mcp-farmer market [options]

Browse and install popular MCP servers.

Options:
  --help       Show this help message

Examples:
  mcp-farmer market`);
}

export async function marketCommand(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  p.intro("MCP Server Market");

  const serverSelection = await p.group(
    {
      server: () =>
        p.select({
          message: "Select an MCP server to install:",
          options: servers.map((server) => ({
            value: server,
            label: server.name,
            hint: server.description,
          })),
        }),
      client: () =>
        p.select({
          message: "Select your MCP client:",
          options: mcpClients.map((client) => ({
            value: client,
            label: client.displayName,
            hint: client.hint,
          })),
        }),
    },
    {
      onCancel: () => {
        p.cancel("Operation cancelled.");
        process.exit(0);
      },
    },
  );

  const server = serverSelection.server;
  const client = serverSelection.client;

  let runner: PackageRunner | undefined;

  if (server.package) {
    const runnerSelection = await p.select({
      message: "Select your preferred package runner:",
      options: runners.map((r) => ({
        value: r,
        label: r.label,
        hint: r.hint,
      })),
    });

    if (p.isCancel(runnerSelection)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }

    runner = runnerSelection;
  }

  const serverName = normalizeServerName(server.name);
  const serverConfig = buildServerConfig(runner, server.package, server.url);
  const configKey = getConfigKey(client.id);

  p.note(
    JSON.stringify({ [serverName]: serverConfig }, null, 2),
    "Server Configuration",
  );

  const confirmSave = await p.confirm({
    message: `Add this server to your ${client.displayName} configuration?`,
    initialValue: true,
  });

  if (p.isCancel(confirmSave) || !confirmSave) {
    p.outro("Configuration not saved.");
    return;
  }

  const s = p.spinner();
  s.start("Saving configuration");

  try {
    await saveServerConfig(client.path, serverName, serverConfig, configKey);
    s.stop("Configuration saved");

    p.note(client.path, "Configuration File");

    p.outro(
      `${server.name} has been added to ${client.displayName}!\n\n   Restart ${client.displayName} to activate the server.`,
    );
  } catch (error) {
    s.stop("Failed to save configuration");
    console.error(error);

    const fullConfig = { [configKey]: { [serverName]: serverConfig } };
    const manualInstallMessage = `Add this to your MCP configuration file:\n${client.path}\n\n${JSON.stringify(fullConfig, null, 2)}`;
    p.note(manualInstallMessage, "Manual Installation");
    process.exit(1);
  }
}
