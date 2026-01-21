import * as acp from "@agentclientprotocol/sdk";
import * as fs from "node:fs/promises";
import { log as writeLog } from "../shared/log.js";
import {
  createPermissionHandler,
  createSessionUpdateHandler,
} from "../shared/acp.js";
import { type SpinnerInstance } from "../shared/prompts.js";

type ActionType = "read" | "list" | "write" | "search" | "command" | "other";

interface AgentProgress {
  filesRead: number;
  filesWritten: number;
  pathsListed: number;
  searches: number;
  commandsRun: number;
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

function formatProgressMessage(progress: AgentProgress): string {
  const parts: string[] = [progress.currentAction];

  const stats: string[] = [];

  if (progress.filesWritten > 0) {
    const fileWord = progress.filesWritten === 1 ? "file" : "files";
    stats.push(`${progress.filesWritten} ${fileWord} created`);
  }

  if (progress.filesRead > 0) {
    const fileWord = progress.filesRead === 1 ? "file" : "files";
    stats.push(`${progress.filesRead} ${fileWord} analyzed`);
  }

  if (progress.pathsListed > 0) {
    const pathWord = progress.pathsListed === 1 ? "path" : "paths";
    stats.push(`${progress.pathsListed} ${pathWord} listed`);
  }

  if (progress.searches > 0) {
    const searchWord = progress.searches === 1 ? "search" : "searches";
    stats.push(`${progress.searches} ${searchWord}`);
  }

  if (progress.commandsRun > 0) {
    const commandWord = progress.commandsRun === 1 ? "command" : "commands";
    stats.push(`${progress.commandsRun} ${commandWord}`);
  }

  if (stats.length > 0) {
    parts.push(`(${stats.join(", ")})`);
  }

  return parts.join(" ");
}

export class CodingClient implements acp.Client {
  private spinner: SpinnerInstance | null = null;
  private progress: AgentProgress = {
    filesRead: 0,
    filesWritten: 0,
    pathsListed: 0,
    searches: 0,
    commandsRun: 0,
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
          this.progress.pathsListed++;
        } else if (type === "read") {
          this.progress.filesRead++;
        } else if (type === "write" || kindStr === "edit") {
          this.progress.filesWritten++;
          this.progress.currentAction = "Writing code";
        } else if (type === "search") {
          this.progress.searches++;
        } else if (type === "command") {
          this.progress.commandsRun++;
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
