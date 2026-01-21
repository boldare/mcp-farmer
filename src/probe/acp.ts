import * as acp from "@agentclientprotocol/sdk";
import {
  createPermissionHandler,
  createSessionUpdateHandler,
} from "../shared/acp.js";
import { type SpinnerInstance } from "../shared/prompts.js";

interface ProbeProgress {
  totalTools: number;
  uniqueToolsTested: Set<string>;
  callsPerTool: Map<string, number>;
  toolCallsById: Map<string, { toolName: string; callNumber: number }>;
  totalCalls: number;
  totalPassed: number;
  totalFailed: number;
  currentToolName: string | null;
  currentCallNumber: number;
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

interface ActionResult {
  action: string;
  phase: ProbeProgress["phase"];
  clearToolName: boolean;
}

function getActionMessage(
  kind: acp.ToolKind | null | undefined,
  title: string | null | undefined,
  toolName: string | null,
  callNumber: number,
): ActionResult {
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
    let displayName: string;
    if (toolName) {
      // Show call number if more than 1 call for this tool
      displayName =
        callNumber > 1
          ? `Testing: ${toolName} (call ${callNumber})`
          : `Testing: ${toolName}`;
    } else {
      displayName = "Calling MCP tool";
    }
    return { action: displayName, phase: "testing", clearToolName: false };
  }

  return { action: "Working", phase: "analyzing", clearToolName: false };
}

function formatProgressMessage(progress: ProbeProgress): string {
  const parts: string[] = [progress.currentAction];

  // Show tool progress when we have total tools count
  if (progress.totalTools > 0) {
    const testedCount = progress.uniqueToolsTested.size;
    const stats: string[] = [];

    // Tool progress: "2/5 tools"
    if (testedCount > 0 || progress.totalCalls > 0) {
      stats.push(`${testedCount}/${progress.totalTools} tools`);
    }

    // Total calls made
    if (progress.totalCalls > 0) {
      stats.push(`${progress.totalCalls} calls`);
    }

    // Failures if any
    if (progress.totalFailed > 0) {
      stats.push(`${progress.totalFailed} failed`);
    }

    if (stats.length > 0) {
      parts.push(`(${stats.join(", ")})`);
    }
  }

  return parts.join(" ");
}

export class ProbeClient implements acp.Client {
  private spinner: SpinnerInstance | null = null;
  private progress: ProbeProgress = {
    totalTools: 0,
    uniqueToolsTested: new Set<string>(),
    callsPerTool: new Map<string, number>(),
    toolCallsById: new Map<string, { toolName: string; callNumber: number }>(),
    totalCalls: 0,
    totalPassed: 0,
    totalFailed: 0,
    currentToolName: null,
    currentCallNumber: 0,
    currentAction: "Preparing probe",
    phase: "analyzing",
  };

  setSpinner(spinner: SpinnerInstance): void {
    this.spinner = spinner;
  }

  setTotalTools(count: number): void {
    this.progress.totalTools = count;
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
      const kindStr = update.kind?.toString() || "other";
      if (toolName) {
        this.progress.currentToolName = toolName;

        // Track calls per tool for showing "call N"
        const currentCount = this.progress.callsPerTool.get(toolName) || 0;
        const newCount = currentCount + 1;
        this.progress.callsPerTool.set(toolName, newCount);
        this.progress.currentCallNumber = newCount;

        if (kindStr === "mcp" || update.title?.toLowerCase().includes("mcp")) {
          this.progress.toolCallsById.set(update.toolCallId, {
            toolName,
            callNumber: newCount,
          });
        }
      }

      const { action, phase, clearToolName } = getActionMessage(
        update.kind,
        update.title,
        this.progress.currentToolName,
        this.progress.currentCallNumber,
      );

      if (clearToolName) {
        this.progress.currentToolName = null;
        this.progress.currentCallNumber = 0;
      }

      this.progress.currentAction = action;
      this.progress.phase = phase;
      this.updateSpinner();
    },
    onToolCallUpdate: (update) => {
      const kindStr = update.kind?.toString() || "other";
      const trackedCall = this.progress.toolCallsById.get(update.toolCallId);
      const toolName = trackedCall?.toolName ?? extractToolName(update.title);

      if (update.status === "completed" || update.status === "failed") {
        if (kindStr === "mcp") {
          this.progress.totalCalls++;

          // Track unique tools that have been tested
          if (toolName) {
            this.progress.uniqueToolsTested.add(toolName);
          }

          if (update.status === "completed") {
            this.progress.totalPassed++;
          } else {
            this.progress.totalFailed++;
          }
          this.updateSpinner();
        }

        if (trackedCall) {
          this.progress.toolCallsById.delete(update.toolCallId);
        }
      }
    },
  });
}
