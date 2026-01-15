import { join } from "node:path";

import {
  getClaudeDesktopPath,
  getClaudeDesktopHint,
} from "../shared/config.js";

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
