import { join } from "node:path";
import { homedir } from "node:os";


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
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

function getClaudeDesktopHint(): string {
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

interface McpClient {
  id: string;
  displayName: string;
  path: string;
  hint: string;
}

export const mcpClients: McpClient[] = [
  {
    id: "cursor",
    displayName: "Cursor",
    path: join(process.cwd(), ".cursor", "mcp.json"),
    hint: ".cursor/mcp.json",
  },
  {
    id: "vscode",
    displayName: "VS Code",
    path: join(process.cwd(), ".vscode", "mcp.json"),
    hint: ".vscode/mcp.json",
  },
  {
    id: "claude-desktop",
    displayName: "Claude Desktop",
    path: getClaudeDesktopPath(),
    hint: getClaudeDesktopHint(),
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    path: join(process.cwd(), ".mcp.json"),
    hint: ".mcp.json",
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    path: join(process.cwd(), "opencode.json"),
    hint: "opencode.json",
  },
  {
    id: "gemini-cli",
    displayName: "Gemini CLI",
    path: join(process.cwd(), ".gemini", "settings.json"),
    hint: ".gemini/settings.json",
  },
];
