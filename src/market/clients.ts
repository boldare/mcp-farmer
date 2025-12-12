import { join } from "node:path";
import { homedir } from "node:os";

export interface McpClient {
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
    path: join(
      homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    ),
    hint: "~/Library/Application Support/Claude/claude_desktop_config.json",
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    path: join(process.cwd(), ".mcp.json"),
    hint: ".mcp.json",
  },
];
