import * as acp from "@agentclientprotocol/sdk";
import {
  createPermissionHandler,
  createSessionUpdateHandler,
} from "../shared/acp.js";
import { type SpinnerInstance } from "../shared/prompts.js";

interface EvalProgress {
  toolsCalled: number;
  toolsPassed: number;
  toolsFailed: number;
  currentToolName: string | null;
  currentAction: string;
  phase: "analyzing" | "testing" | "reporting";
}

function extractToolName(title: string | null | undefined): string | null {
  if (!title) return null;

  const lower = title.toLowerCase();

  // Skip internal/agent tools (including those with paths or arguments)
  if (
    lower === "read" ||
    lower === "write" ||
    lower === "list" ||
    lower === "search" ||
    lower === "grep" ||
    lower === "shell" ||
    lower.startsWith("read ") ||
    lower.startsWith("write ") ||
    lower.startsWith("list ") ||
    lower.startsWith("search ") ||
    lower.startsWith("grep ") ||
    lower.startsWith("shell ")
  ) {
    return null;
  }

  // Handle Claude Code format: mcp__ServerName__toolName
  if (title.startsWith("mcp__")) {
    const parts = title.split("__");
    if (parts.length >= 3) {
      return parts.slice(2).join("__"); // Return just the tool name
    }
  }

  // Handle simple mcp_ prefix
  if (lower.startsWith("mcp_")) {
    return title.slice(4);
  }

  return title;
}

function getActionMessage(
  kind: acp.ToolKind | null | undefined,
  title: string | null | undefined,
  toolName: string | null,
): { action: string; phase: EvalProgress["phase"]; clearToolName: boolean } {
  const kindStr = kind?.toString() || "other";
  const titleLower = title?.toLowerCase() || "";

  // Check for file operations first (they take priority over stale MCP tool names)
  if (kindStr === "edit" || titleLower.startsWith("write ")) {
    return {
      action: "Writing report",
      phase: "reporting",
      clearToolName: true,
    };
  }

  if (kindStr === "read" || titleLower.startsWith("read ")) {
    return { action: "Analyzing", phase: "analyzing", clearToolName: true };
  }

  // Check for MCP tool calls
  if (titleLower.includes("mcp") || kindStr === "mcp") {
    const displayName = toolName ? `Testing: ${toolName}` : "Calling MCP tool";
    return { action: displayName, phase: "testing", clearToolName: false };
  }

  return { action: "Working", phase: "analyzing", clearToolName: false };
}

function formatProgressMessage(progress: EvalProgress): string {
  const parts: string[] = [progress.currentAction];

  if (progress.toolsCalled > 0) {
    const stats: string[] = [];
    stats.push(`${progress.toolsCalled} tested`);

    if (progress.toolsPassed > 0 || progress.toolsFailed > 0) {
      if (progress.toolsFailed > 0) {
        stats.push(`${progress.toolsFailed} failed`);
      }
    }

    parts.push(`(${stats.join(", ")})`);
  }

  return parts.join(" ");
}

export class EvalClient implements acp.Client {
  private spinner: SpinnerInstance | null = null;
  private progress: EvalProgress = {
    toolsCalled: 0,
    toolsPassed: 0,
    toolsFailed: 0,
    currentToolName: null,
    currentAction: "Preparing evaluation",
    phase: "analyzing",
  };

  setSpinner(spinner: SpinnerInstance): void {
    this.spinner = spinner;
  }

  stopSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.stop(message);
      this.spinner = null;
    }
  }

  private updateSpinner(): void {
    if (this.spinner) {
      this.spinner.message(formatProgressMessage(this.progress));
    }
  }

  private getProgressMessage = (): string => {
    return formatProgressMessage(this.progress);
  };

  requestPermission = createPermissionHandler(
    () => this.spinner,
    this.getProgressMessage,
  );

  sessionUpdate = createSessionUpdateHandler({
    onToolCall: (update) => {
      const toolName = extractToolName(update.title);
      if (toolName) {
        this.progress.currentToolName = toolName;
      }

      const { action, phase, clearToolName } = getActionMessage(
        update.kind,
        update.title,
        this.progress.currentToolName,
      );

      if (clearToolName) {
        this.progress.currentToolName = null;
      }

      this.progress.currentAction = action;
      this.progress.phase = phase;
      this.updateSpinner();
    },
    onToolCallUpdate: (update) => {
      const kindStr = update.kind?.toString() || "other";

      if (update.status === "completed" || update.status === "failed") {
        if (kindStr === "mcp") {
          this.progress.toolsCalled++;
          if (update.status === "completed") {
            this.progress.toolsPassed++;
          } else {
            this.progress.toolsFailed++;
          }
          this.updateSpinner();
        }
      }
    },
  });
}
