import * as p from "@clack/prompts";
import * as acp from "@agentclientprotocol/sdk";
import { log as writeLog } from "../shared/log.js";

type SpinnerInstance = ReturnType<typeof p.spinner>;

interface EvalProgress {
  toolsCalled: number;
  currentAction: string;
}

function getActionMessage(
  kind: acp.ToolKind | null | undefined,
  title: string | null | undefined,
): string {
  const kindStr = kind?.toString() || "other";
  const titleLower = title?.toLowerCase() || "";

  if (titleLower.includes("mcp") || kindStr === "mcp") {
    return "Calling MCP tool";
  }

  if (kindStr === "read") {
    return "Analyzing";
  }

  if (kindStr === "edit") {
    return "Writing report";
  }

  return "Working";
}

function formatProgressMessage(progress: EvalProgress): string {
  const parts: string[] = [progress.currentAction];

  if (progress.toolsCalled > 0) {
    const callWord = progress.toolsCalled === 1 ? "call" : "calls";
    parts.push(`(${progress.toolsCalled} tool ${callWord})`);
  }

  return parts.join(" ");
}

export class EvalClient implements acp.Client {
  private spinner: SpinnerInstance | null = null;
  private suppressedToolCalls = new Set<string>();
  private progress: EvalProgress = {
    toolsCalled: 0,
    currentAction: "Starting",
  };

  setSpinner(spinner: SpinnerInstance): void {
    this.spinner = spinner;
  }

  private updateSpinner(): void {
    if (this.spinner) {
      this.spinner.message(formatProgressMessage(this.progress));
    }
  }

  async requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    if (this.spinner) {
      this.spinner.stop("Permission required");
    }

    writeLog("permission_requested", params.toolCall.title || undefined);

    const response = await p.select({
      message: "Agent needs permission to proceed:",
      options: params.options.map((option) => ({
        value: option.optionId,
        label: option.name,
        hint: option.kind,
      })),
    });

    if (p.isCancel(response)) {
      writeLog("permission_cancelled", params.toolCall.title || undefined);
      return {
        outcome: {
          outcome: "cancelled",
        },
      };
    }

    writeLog("permission_granted", `${params.toolCall.title}: ${response}`);

    if (this.spinner) {
      this.spinner.start(formatProgressMessage(this.progress));
    }

    return {
      outcome: {
        outcome: "selected",
        optionId: response,
      },
    };
  }

  async sessionUpdate({ update }: acp.SessionNotification): Promise<void> {
    try {
      switch (update.sessionUpdate) {
        case "tool_call":
          this.handleToolCall(update);
          break;
        case "tool_call_update":
          this.handleToolCallUpdate(update);
          break;
      }
    } catch (error) {
      writeLog("session_update_error", error);
    }
  }

  private handleToolCall(update: acp.ToolCall): void {
    const toolCallId = update.toolCallId;
    const title = update.title?.toLowerCase() || "";

    if (title === "todowrite") {
      this.suppressedToolCalls.add(toolCallId);
      return;
    }

    writeLog("tool_call_started", update.title || "unknown");

    const actionMessage = getActionMessage(update.kind, update.title);
    this.progress.currentAction = actionMessage;
    this.updateSpinner();
  }

  private handleToolCallUpdate(update: acp.ToolCallUpdate): void {
    const { toolCallId, status, kind } = update;
    const kindStr = kind?.toString() || "other";

    if (this.suppressedToolCalls.has(toolCallId)) {
      if (status === "completed" || status === "failed") {
        this.suppressedToolCalls.delete(toolCallId);
      }
      return;
    }

    if (status === "completed") {
      if (kindStr === "mcp") {
        this.progress.toolsCalled++;
      }
      this.updateSpinner();
      writeLog("tool_call_completed", kindStr);
    } else if (status === "failed") {
      writeLog("tool_call_failed", kindStr);
    }
  }
}
