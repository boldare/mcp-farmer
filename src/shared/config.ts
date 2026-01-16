import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  source: string;
}

export interface McpServerConfig {
  command?: string | string[];
  args?: string[];
  url?: string;
  type?: "http" | "stdio" | "local" | "remote" | "sse";
  enabled?: boolean;
  env?: Record<string, string>;
}

interface ConfigLocation {
  path: string;
  hint: string;
  configKey: "mcpServers" | "servers" | "mcp";
}

export function getClaudeDesktopPath(): string {
  switch (process.platform) {
    case "darwin":
      return join(
        homedir(),
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      );
    case "win32":
      return join(
        process.env.APPDATA || "",
        "Claude",
        "claude_desktop_config.json",
      );
    case "linux":
      return join(homedir(), ".config", "claude", "config.json");
    default:
      return "";
  }
}

export function getClaudeDesktopHint(): string {
  switch (process.platform) {
    case "darwin":
      return "~/Library/Application Support/Claude/claude_desktop_config.json";
    case "win32":
      return "%APPDATA%/Claude/claude_desktop_config.json";
    case "linux":
      return "~/.config/claude/config.json";
    default:
      return "Claude Desktop config";
  }
}

function getConfigLocations(cwd: string): ConfigLocation[] {
  return [
    {
      path: join(cwd, ".cursor", "mcp.json"),
      hint: ".cursor/mcp.json",
      configKey: "mcpServers",
    },
    {
      path: join(cwd, ".vscode", "mcp.json"),
      hint: ".vscode/mcp.json",
      configKey: "servers",
    },
    {
      path: getClaudeDesktopPath(),
      hint: "Claude Desktop",
      configKey: "mcpServers",
    },
    {
      path: join(cwd, ".mcp.json"),
      hint: ".mcp.json",
      configKey: "mcpServers",
    },
    {
      path: join(cwd, "opencode.json"),
      hint: "opencode.json",
      configKey: "mcp",
    },
    {
      path: join(cwd, ".gemini", "settings.json"),
      hint: ".gemini/settings.json",
      configKey: "mcpServers",
    },
  ];
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function parseConfigFile(
  configPath: string,
  configKey?: "mcpServers" | "servers" | "mcp",
): Promise<McpServerEntry[]> {
  const content = await readFile(configPath, "utf-8");
  const config = JSON.parse(content);

  // Auto-detect config key if not provided
  const key =
    configKey ??
    (config.mcpServers
      ? "mcpServers"
      : config.servers
        ? "servers"
        : config.mcp
          ? "mcp"
          : null);

  if (!key || !config[key]) {
    return [];
  }

  const servers = config[key] as Record<string, McpServerConfig>;
  return Object.entries(servers).map(([name, serverConfig]) => ({
    name,
    config: serverConfig,
    source: configPath,
  }));
}

export async function discoverServers(): Promise<McpServerEntry[]> {
  const locations = getConfigLocations(process.cwd());
  const servers: McpServerEntry[] = [];

  for (const location of locations) {
    if (await fileExists(location.path)) {
      try {
        const entries = await parseConfigFile(
          location.path,
          location.configKey,
        );
        servers.push(...entries);
      } catch {
        // Skip invalid config files
      }
    }
  }

  return servers;
}
