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

function getClaudeDesktopPath(): string {
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

export function getConfigLocations(): ConfigLocation[] {
  return [
    {
      path: join(process.cwd(), ".cursor", "mcp.json"),
      hint: ".cursor/mcp.json",
      configKey: "mcpServers",
    },
    {
      path: join(process.cwd(), ".vscode", "mcp.json"),
      hint: ".vscode/mcp.json",
      configKey: "servers",
    },
    {
      path: getClaudeDesktopPath(),
      hint: "Claude Desktop",
      configKey: "mcpServers",
    },
    {
      path: join(process.cwd(), ".mcp.json"),
      hint: ".mcp.json",
      configKey: "mcpServers",
    },
    {
      path: join(process.cwd(), "opencode.json"),
      hint: "opencode.json",
      configKey: "mcp",
    },
    {
      path: join(process.cwd(), ".gemini", "settings.json"),
      hint: ".gemini/settings.json",
      configKey: "mcpServers",
    },
  ];
}

async function fileExists(path: string): Promise<boolean> {
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
  const locations = getConfigLocations();
  const servers: McpServerEntry[] = [];

  for (const location of locations) {
    if (await fileExists(location.path)) {
      try {
        const entries = await parseConfigFile(location.path, location.configKey);
        servers.push(...entries);
      } catch {
        // Skip invalid config files
      }
    }
  }

  return servers;
}

export function serverToVetTarget(
  entry: McpServerEntry,
): { mode: "http"; url: URL } | { mode: "stdio"; command: string; args: string[] } | null {
  const { config } = entry;

  // HTTP mode
  if (config.url) {
    try {
      return { mode: "http", url: new URL(config.url) };
    } catch {
      return null;
    }
  }

  // Stdio mode
  if (config.command) {
    if (Array.isArray(config.command)) {
      // OpenCode style: command is an array
      const [cmd, ...cmdArgs] = config.command;
      if (!cmd) return null;
      return { mode: "stdio", command: cmd, args: cmdArgs };
    }
    // Standard style: command is string, args is array
    return {
      mode: "stdio",
      command: config.command,
      args: config.args ?? [],
    };
  }

  return null;
}
