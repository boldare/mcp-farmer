import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { servers } from "./servers.js";
import { mcpClients } from "./clients.js";
import type { McpServerConfig } from "../shared/config.js";
import {
  select,
  confirm,
  spinner,
  intro,
  outro,
  note,
  log,
  handleCancel,
} from "../shared/prompts.js";

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

function getConfigKey(clientId: string): "mcpServers" | "servers" | "mcp" {
  if (clientId === "vscode") return "servers";
  if (clientId === "opencode") return "mcp";
  return "mcpServers";
}

function buildServerConfig(
  runner: PackageRunner | undefined,
  packageName?: string,
  url?: string,
  clientId?: string,
): McpServerConfig {
  const isOpencode = clientId === "opencode";

  if (url) {
    return isOpencode
      ? { type: "remote", url, enabled: true }
      : { url, type: "http" };
  }

  if (!runner || !packageName) {
    throw new Error(
      "Runner and packageName are required for package-based servers",
    );
  }

  if (isOpencode) {
    return {
      type: "local",
      command: [runner.command, ...runner.args, packageName],
      enabled: true,
    };
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
  configKey: "mcpServers" | "servers" | "mcp",
): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });

  let existingConfig;
  try {
    const content = await readFile(configPath, "utf-8");
    existingConfig = JSON.parse(content);
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      existingConfig = {};
    } else {
      throw new Error(
        `Failed to parse existing config file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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

  intro("MCP Server Market");

  let server: (typeof servers)[number];
  let client: (typeof mcpClients)[number];
  let runner: PackageRunner | undefined;

  try {
    server = await select({
      message: "Select an MCP server to install:",
      choices: servers.map((s) => ({
        value: s,
        name: s.name,
        description: s.description,
      })),
    });

    client = await select({
      message: "Select your MCP client:",
      choices: mcpClients.map((c) => ({
        value: c,
        name: c.displayName,
        description: c.hint,
      })),
    });

    if (server.package) {
      runner = await select({
        message: "Select your preferred package runner:",
        choices: runners.map((r) => ({
          value: r,
          name: r.label,
          description: r.hint,
        })),
      });
    }
  } catch (error) {
    handleCancel(error);
  }

  const serverName = normalizeServerName(server.name);
  const serverConfig = buildServerConfig(
    runner,
    server.package,
    server.url,
    client.id,
  );
  const configKey = getConfigKey(client.id);

  note(
    JSON.stringify({ [serverName]: serverConfig }, null, 2),
    "Server Configuration",
  );

  try {
    const confirmSave = await confirm({
      message: `Add this server to your ${client.displayName} configuration?`,
      default: true,
    });

    if (!confirmSave) {
      outro("Configuration not saved.");
      process.exit(0);
    }
  } catch (error) {
    handleCancel(error);
  }

  const s = spinner();
  s.start("Saving configuration");

  try {
    await saveServerConfig(client.path, serverName, serverConfig, configKey);
    s.stop("Configuration saved");

    note(client.path, "Configuration File");

    outro(
      `${server.name} has been added to ${client.displayName}!\n\n   Restart ${client.displayName} to activate the server.`,
    );

    log.message(
      `What's next?\n` +
        `  mcp-farmer try   Test the installed server\n` +
        `  mcp-farmer vet   Check the server's quality`,
    );

    process.exit(0);
  } catch (error) {
    s.stop("Failed to save configuration");
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}\n`);

    const fullConfig = { [configKey]: { [serverName]: serverConfig } };
    const manualInstallMessage = `Add this to your MCP configuration file:\n${client.path}\n\n${JSON.stringify(fullConfig, null, 2)}`;
    note(manualInstallMessage, "Manual Installation");
    process.exit(1);
  }
}
