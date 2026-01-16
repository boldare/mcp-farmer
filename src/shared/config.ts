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

type ConfigKey = "mcpServers" | "servers" | "mcp";

interface ConfigLocation {
  path: string;
  hint: string;
  configKey: ConfigKey;
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
  configKey?: ConfigKey,
): Promise<McpServerEntry[]> {
  const content = await readFile(configPath, "utf-8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON: ${details}`);
  }

  if (!isRecord(parsed)) {
    console.warn(
      `Warning: MCP config file is not an object, skipping: ${configPath}`,
    );
    return [];
  }

  // Auto-detect config key if not provided
  const key =
    configKey ??
    ("mcpServers" in parsed
      ? "mcpServers"
      : "servers" in parsed
        ? "servers"
        : "mcp" in parsed
          ? "mcp"
          : null);

  if (!key) {
    return [];
  }

  const serversRaw = parsed[key];
  if (!isRecord(serversRaw)) {
    console.warn(
      `Warning: MCP config key "${key}" is not an object, skipping: ${configPath}`,
    );
    return [];
  }

  const entries: McpServerEntry[] = [];

  for (const [name, serverUnknown] of Object.entries(serversRaw)) {
    const config = parseServerConfig(serverUnknown, configPath, name);
    if (!config) continue;
    entries.push({ name, config, source: configPath });
  }

  return entries;
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
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        console.warn(
          `Warning: Skipping invalid MCP config file (${location.hint}): ${location.path}\n` +
            `${details}`,
        );
      }
    }
  }

  return servers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseServerConfig(
  raw: unknown,
  sourcePath: string,
  name: string,
): McpServerConfig | null {
  if (!isRecord(raw)) {
    console.warn(
      `Warning: Skipping server "${name}" in ${sourcePath}: expected an object`,
    );
    return null;
  }

  const url = typeof raw.url === "string" ? raw.url : undefined;
  if (raw.url !== undefined && url === undefined) {
    console.warn(
      `Warning: Ignoring invalid "url" for server "${name}" in ${sourcePath}: expected string`,
    );
  }

  const command = parseCommand(raw.command);
  if (raw.command !== undefined && command === undefined) {
    console.warn(
      `Warning: Ignoring invalid "command" for server "${name}" in ${sourcePath}: expected string or string[]`,
    );
  }

  const args = parseStringArray(raw.args);
  if (raw.args !== undefined && args === undefined) {
    console.warn(
      `Warning: Ignoring invalid "args" for server "${name}" in ${sourcePath}: expected string[]`,
    );
  }

  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : undefined;
  if (raw.enabled !== undefined && enabled === undefined) {
    console.warn(
      `Warning: Ignoring invalid "enabled" for server "${name}" in ${sourcePath}: expected boolean`,
    );
  }

  const type = parseType(raw.type);
  if (raw.type !== undefined && type === undefined) {
    console.warn(
      `Warning: Ignoring invalid "type" for server "${name}" in ${sourcePath}: expected one of http|stdio|local|remote|sse`,
    );
  }

  const env = parseEnv(raw.env, sourcePath, name);
  if (raw.env !== undefined && env === undefined) {
    console.warn(
      `Warning: Ignoring invalid "env" for server "${name}" in ${sourcePath}: expected record of strings`,
    );
  }

  if (!url && !command) {
    console.warn(
      `Warning: Skipping server "${name}" in ${sourcePath}: missing "url" or "command"`,
    );
    return null;
  }

  return {
    url,
    command,
    args,
    enabled,
    type,
    env,
  };
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  if (!value.every((v) => typeof v === "string")) return undefined;
  return value;
}

function parseCommand(value: unknown): string | string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  const arr = parseStringArray(value);
  return arr;
}

function parseType(value: unknown): McpServerConfig["type"] | undefined {
  if (value === undefined) return undefined;
  if (value === "http") return "http";
  if (value === "stdio") return "stdio";
  if (value === "local") return "local";
  if (value === "remote") return "remote";
  if (value === "sse") return "sse";
  return undefined;
}

function parseEnv(
  value: unknown,
  sourcePath: string,
  name: string,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") {
      env[k] = v;
    } else {
      console.warn(
        `Warning: Skipping env var "${k}" for server "${name}" in ${sourcePath}: expected string value`,
      );
    }
  }
  return env;
}
