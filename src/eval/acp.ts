import * as acp from "@agentclientprotocol/sdk";
import {
  createPermissionHandler,
  createSessionUpdateHandler,
} from "../shared/acp.js";
import { type SpinnerInstance } from "../shared/prompts.js";

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
  private progress: EvalProgress = {
    toolsCalled: 0,
    currentAction: "Starting",
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

  private getProgressMessage = (): string => {
    return formatProgressMessage(this.progress);
  };

  requestPermission = createPermissionHandler(
    () => this.spinner,
    this.getProgressMessage,
  );

  sessionUpdate = createSessionUpdateHandler({
    onToolCall: (update) => {
      this.progress.currentAction = getActionMessage(update.kind, update.title);
    },
    onToolCallUpdate: (update) => {
      const kindStr = update.kind?.toString() || "other";
      if (update.status === "completed") {
        if (kindStr === "mcp") {
          this.progress.toolsCalled++;
        }
      }
    },
  });
}
