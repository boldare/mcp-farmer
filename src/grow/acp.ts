import * as p from "@clack/prompts";
import * as acp from "@agentclientprotocol/sdk";
import * as fs from "node:fs/promises";
import { log as writeLog } from "../shared/log.js";
import {
  createPermissionHandler,
  createSessionUpdateHandler,
} from "../shared/acp.js";

type SpinnerInstance = ReturnType<typeof p.spinner>;

interface AgentProgress {
  filesRead: number;
  filesWritten: number;
  currentAction: string;
}

function getActionMessage(
  kind: acp.ToolKind | null | undefined,
  title: string | null | undefined,
): string {
  const kindStr = kind?.toString() || "other";
  const titleLower = title?.toLowerCase() || "";

  if (kindStr === "read") {
    if (titleLower === "list" || titleLower.includes("list")) {
      return "Exploring project structure";
    }
    return "Reading project files";
  }

  if (kindStr === "edit") {
    return "Writing code";
  }

  if (titleLower.includes("search") || titleLower.includes("grep")) {
    return "Searching codebase";
  }

  if (titleLower.includes("shell") || titleLower.includes("terminal")) {
    return "Running commands";
  }

  return "Working";
}

function formatProgressMessage(progress: AgentProgress): string {
  const parts: string[] = [progress.currentAction];

  if (progress.filesWritten > 0) {
    const fileWord = progress.filesWritten === 1 ? "file" : "files";
    parts.push(`(${progress.filesWritten} ${fileWord} created)`);
  } else if (progress.filesRead > 0 && progress.filesWritten === 0) {
    parts.push(`(${progress.filesRead} files analyzed)`);
  }

  return parts.join(" ");
}

export class CodingClient implements acp.Client {
  private spinner: SpinnerInstance | null = null;
  private progress: AgentProgress = {
    filesRead: 0,
    filesWritten: 0,
    currentAction: "Starting",
  };

  setSpinner(spinner: SpinnerInstance): void {
    this.spinner = spinner;
  }

  private getProgressMessage = (): string => {
    return formatProgressMessage(this.progress);
  };

  private updateSpinner(): void {
    if (this.spinner) {
      this.spinner.message(this.getProgressMessage());
    }
  }

  requestPermission = createPermissionHandler(
    () => this.spinner,
    this.getProgressMessage,
  );

  sessionUpdate = createSessionUpdateHandler({
    onToolCall: (update) => {
      this.progress.currentAction = getActionMessage(update.kind, update.title);
      this.updateSpinner();
    },
    onToolCallUpdate: (update) => {
      const { status, kind } = update;
      const kindStr = kind?.toString() || "other";

      if (status === "completed") {
        if (kindStr === "read") {
          this.progress.filesRead++;
        } else if (kindStr === "edit") {
          this.progress.filesWritten++;
          this.progress.currentAction = "Writing code";
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
