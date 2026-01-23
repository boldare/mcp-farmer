import * as acp from "@agentclientprotocol/sdk";
import * as fs from "node:fs/promises";
import { log as writeLog } from "../shared/log.js";
import {
  createPermissionHandler,
  createSessionUpdateHandler,
} from "../shared/acp.js";
import { type SpinnerInstance } from "../shared/prompts.js";
import { pluralize } from "../shared/text.js";

type ActionType = "read" | "list" | "write" | "search" | "command" | "other";

interface AgentProgress {
  counts: Record<ActionType, number>;
  currentAction: string;
  currentActionType: ActionType;
}

interface ActionResult {
  action: string;
  type: ActionType;
}

function getActionMessage(
  kind: acp.ToolKind | null | undefined,
  title: string | null | undefined,
): ActionResult {
  const kindStr = kind?.toString() || "other";
  const titleLower = title?.toLowerCase() || "";

  if (kindStr === "read") {
    if (titleLower === "list" || titleLower.includes("list")) {
      return { action: "Exploring project structure", type: "list" };
    }
    return { action: "Reading project files", type: "read" };
  }

  if (kindStr === "edit" || titleLower.startsWith("write ")) {
    return { action: "Writing code", type: "write" };
  }

  if (titleLower.includes("search") || titleLower.includes("grep")) {
    return { action: "Searching codebase", type: "search" };
  }

  if (titleLower.includes("shell") || titleLower.includes("terminal")) {
    return { action: "Running commands", type: "command" };
  }

  return { action: "Working", type: "other" };
}

const STAT_ORDER: ActionType[] = ["write", "read", "list", "search", "command"];

const STAT_FORMATTERS: Partial<Record<ActionType, (count: number) => string>> = {
  write: (count) => `${count} ${pluralize("file", count)} created`,
  read: (count) => `${count} ${pluralize("file", count)} analyzed`,
  list: (count) => `${count} ${pluralize("path", count)} listed`,
  search: (count) => `${count} ${pluralize("search", count)}`,
  command: (count) => `${count} ${pluralize("command", count)}`,
};

function formatProgressMessage(progress: AgentProgress): string {
  const stats = [];

  for (const type of STAT_ORDER) {
    const count = progress.counts[type];
    const formatter = STAT_FORMATTERS[type];
    if (count > 0 && formatter) {
      stats.push(formatter(count));
    }
  }

  const parts = [progress.currentAction];
  if (stats.length > 0) {
    parts.push(`(${stats.join(", ")})`);
  }

  return parts.join(" ");
}

export class CodingClient implements acp.Client {
  private spinner: SpinnerInstance | null = null;
  private progress: AgentProgress = {
    counts: {
      read: 0,
      list: 0,
      write: 0,
      search: 0,
      command: 0,
      other: 0,
    },
    currentAction: "Preparing workspace",
    currentActionType: "other",
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
      const { action, type } = getActionMessage(update.kind, update.title);
      this.progress.currentAction = action;
      this.progress.currentActionType = type;
      this.updateSpinner();
    },
    onToolCallUpdate: (update) => {
      const { status, kind } = update;
      const kindStr = kind?.toString() || "other";
      const { type } = getActionMessage(update.kind, update.title);

      if (status === "completed") {
        if (type === "list") {
          this.progress.counts.list++;
        } else if (type === "read") {
          this.progress.counts.read++;
        } else if (type === "write" || kindStr === "edit") {
          this.progress.counts.write++;
          this.progress.currentAction = "Writing code";
        } else if (type === "search") {
          this.progress.counts.search++;
        } else if (type === "command") {
          this.progress.counts.command++;
        } else {
          this.progress.counts.other++;
        }
        this.updateSpinner();
      }
    },
  });

  async readTextFile(
    params: acp.ReadTextFileRequest,
  ): Promise<acp.ReadTextFileResponse> {
    writeLog("read_file_request", `path: ${params.path}`);

    try {
      const stat = await fs.stat(params.path);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(params.path);
        const content = entries.join("\n");
        writeLog(
          "read_file_success",
          `directory listing: ${entries.length} entries`,
        );
        return { content };
      }

      const content = await fs.readFile(params.path, "utf8");
      writeLog("read_file_success", `file: ${content.length} bytes`);
      return { content };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLog("read_file_error", `${params.path}: ${message}`);
      throw error;
    }
  }

  async writeTextFile(
    params: acp.WriteTextFileRequest,
  ): Promise<acp.WriteTextFileResponse> {
    writeLog(
      "write_file_request",
      `path: ${params.path}, size: ${params.content.length} bytes`,
    );

    try {
      await fs.writeFile(params.path, params.content);
      writeLog("write_file_success", params.path);
      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLog("write_file_error", `${params.path}: ${message}`);
      throw error;
    }
  }
}
