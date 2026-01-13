import * as p from "@clack/prompts";
import * as acp from "@agentclientprotocol/sdk";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export function shortPath(filePath: string): string {
  const cwd = process.cwd();
  if (filePath.startsWith(cwd)) {
    return filePath.slice(cwd.length + 1);
  }
  return path.basename(filePath);
}

export function formatDiffStats(additions: number, deletions: number): string {
  const parts: string[] = [];
  if (additions > 0) parts.push(`\x1b[32m+${additions}\x1b[0m`);
  if (deletions > 0) parts.push(`\x1b[31m-${deletions}\x1b[0m`);
  return parts.length > 0 ? ` (${parts.join(" ")})` : "";
}

function displayDiffContent(
  oldText: string | null | undefined,
  newText: string,
  filePath: string,
): void {
  const displayPath = shortPath(filePath);
  const oldLines = (oldText || "").split("\n");
  const newLines = newText.split("\n");

  console.log(`\x1b[36m┌─ ${displayPath} ─┐\x1b[0m`);

  const maxLinesToShow = 20;
  let linesShown = 0;

  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    if (linesShown >= maxLinesToShow) {
      const remaining = Math.max(oldLines.length, newLines.length) - i;
      if (remaining > 0) {
        console.log(`\x1b[2m  ... ${remaining} more lines\x1b[0m`);
      }
      break;
    }

    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine !== newLine) {
      if (oldLine !== undefined && oldLine !== newLine) {
        console.log(`\x1b[31m  - ${oldLine}\x1b[0m`);
        linesShown++;
      }
      if (newLine !== undefined) {
        console.log(`\x1b[32m  + ${newLine}\x1b[0m`);
        linesShown++;
      }
    }
  }

  console.log(`\x1b[36m└${"─".repeat(displayPath.length + 4)}┘\x1b[0m`);
}

function displayNewFileContent(newText: string, filePath: string): void {
  const displayPath = shortPath(filePath);
  const lines = newText.split("\n").filter((l) => l.trim());
  const totalLines = newText.split("\n").length;

  console.log(`\x1b[36m┌─ ${displayPath} (new) ─┐\x1b[0m`);

  const maxLinesToShow = 12;
  for (let i = 0; i < Math.min(lines.length, maxLinesToShow); i++) {
    console.log(`\x1b[32m  + ${lines[i]}\x1b[0m`);
  }

  if (totalLines > maxLinesToShow) {
    console.log(
      `\x1b[2m  ... ${totalLines - maxLinesToShow} more lines\x1b[0m`,
    );
  }

  console.log(`\x1b[36m└${"─".repeat(displayPath.length + 10)}┘\x1b[0m`);
}

interface ActiveTaskLog {
  log: ReturnType<typeof p.taskLog>;
  startTime: number;
  displayedDiffHash?: string;
  displayedPath?: string;
}

export function getToolDisplayTitle(
  kind: acp.ToolKind | null | undefined,
  title: string | null | undefined,
): string {
  const kindStr = kind?.toString() || "other";
  const titleLower = title?.toLowerCase() || "";

  switch (kindStr) {
    case "edit":
      return "Writing file...";
    case "read":
      return titleLower === "list" ? "Listing directory..." : "Reading file...";
    default:
      return title || "Running...";
  }
}

export function extractDiffFromContent(
  content: acp.ToolCallContent[] | null | undefined,
): (acp.Diff & { type: "diff" }) | undefined {
  if (!content) return undefined;

  for (const item of content) {
    if (item.type === "diff") {
      return item;
    }
  }
  return undefined;
}

export function hashDiff(diff: acp.Diff): string {
  return `${diff.path}:${diff.newText.length}:${diff.oldText?.length || 0}`;
}

export class CodingClient implements acp.Client {
  private activeTaskLogs = new Map<string, ActiveTaskLog>();
  private suppressedToolCalls = new Set<string>();
  private lastPlanHash = "";

  async requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    p.log.step(`🔐 Permission requested: ${params.toolCall.title}`);

    const response = await p.select({
      message: "Select an action:",
      options: params.options.map((option) => ({
        value: option.optionId,
        label: option.name,
        hint: option.kind,
      })),
    });

    if (p.isCancel(response)) {
      return {
        outcome: {
          outcome: "cancelled",
        },
      };
    }

    return {
      outcome: {
        outcome: "selected",
        optionId: response,
      },
    };
  }

  async readTextFile(
    params: acp.ReadTextFileRequest,
  ): Promise<acp.ReadTextFileResponse> {
    // Check if path is a directory
    const stat = await fs.stat(params.path);
    if (stat.isDirectory()) {
      // Return directory listing instead of throwing
      const entries = await fs.readdir(params.path);
      const content = entries.join("\n");
      return { content };
    }

    const content = await fs.readFile(params.path, "utf8");
    return { content };
  }

  async writeTextFile(
    params: acp.WriteTextFileRequest,
  ): Promise<acp.WriteTextFileResponse> {
    await fs.writeFile(params.path, params.content);
    return {};
  }

  async sessionUpdate({ update }: acp.SessionNotification): Promise<void> {
    try {
      switch (update.sessionUpdate) {
        case "agent_message_chunk":
          this.handleMessageChunk(update);
          break;
        case "agent_thought_chunk":
          this.handleThoughtChunk(update);
          break;
        case "tool_call":
          this.handleToolCall(update);
          break;
        case "tool_call_update":
          this.handleToolCallUpdate(update);
          break;
        case "plan":
          this.handlePlanUpdate(update);
          break;
      }
    } catch (error) {
      console.error(
        `\x1b[31mSession update error:\x1b[0m`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private handleMessageChunk(update: {
    content: { type: string; text?: string };
  }): void {
    if (update.content.type === "text" && update.content.text?.trim()) {
      process.stdout.write(update.content.text);
    }
  }

  private handleThoughtChunk(update: {
    content: { type: string; text?: string };
  }): void {
    if (update.content.type === "text" && update.content.text?.trim()) {
      process.stdout.write(`\x1b[2m${update.content.text}\x1b[0m`);
    }
  }

  private handleToolCall(update: acp.ToolCall): void {
    const toolCallId = update.toolCallId;
    const title = update.title?.toLowerCase() || "";

    if (title === "todowrite") {
      this.suppressedToolCalls.add(toolCallId);
      return;
    }

    const displayTitle = getToolDisplayTitle(update.kind, update.title);
    const log = p.taskLog({
      title: displayTitle,
      limit: 5,
    });

    this.activeTaskLogs.set(toolCallId, {
      log,
      startTime: Date.now(),
    });
  }

  private handleToolCallUpdate(update: acp.ToolCallUpdate): void {
    const { toolCallId, status, kind, title, locations, content } = update;
    const kindStr = kind?.toString() || "other";

    if (this.suppressedToolCalls.has(toolCallId)) {
      if (status === "completed" || status === "failed") {
        this.suppressedToolCalls.delete(toolCallId);
      }
      return;
    }

    const activeTask = this.activeTaskLogs.get(toolCallId);

    if (status === "in_progress" && activeTask) {
      const firstLocation = locations?.[0];
      const currentPath = firstLocation?.path;

      if (currentPath && activeTask.displayedPath !== currentPath) {
        activeTask.displayedPath = currentPath;
        activeTask.log.message(shortPath(currentPath));
      }
    }

    if (status === "completed" || status === "failed") {
      const diff = extractDiffFromContent(content);
      let diffInfo = "";
      let displayText = title || "";

      if (kindStr === "edit" && diff) {
        const currentHash = hashDiff(diff);
        const newLines = diff.newText.split("\n").length;
        const oldLines = diff.oldText ? diff.oldText.split("\n").length : 0;
        diffInfo = formatDiffStats(newLines, oldLines);
        displayText = shortPath(diff.path);

        if (!activeTask?.displayedDiffHash) {
          if (diff.oldText) {
            displayDiffContent(diff.oldText, diff.newText, diff.path);
          } else {
            displayNewFileContent(diff.newText, diff.path);
          }
          if (activeTask) activeTask.displayedDiffHash = currentHash;
        }
      } else {
        const firstLocation = locations?.[0];
        if (firstLocation?.path) {
          displayText = shortPath(firstLocation.path);
        }
      }

      const resultMessage = `${displayText}${diffInfo}`;

      if (activeTask) {
        if (status === "completed") {
          activeTask.log.success(resultMessage);
        } else {
          activeTask.log.error(resultMessage);
        }
        this.activeTaskLogs.delete(toolCallId);
      } else if (status === "completed") {
        p.log.success(resultMessage);
      } else {
        p.log.error(resultMessage);
      }
    }
  }

  private handlePlanUpdate(update: acp.Plan): void {
    const entries = update.entries;
    if (!entries || entries.length === 0) return;

    const hasActive = entries.some((e) => e.status !== "completed");
    if (!hasActive) return;

    const planHash = entries.map((e) => `${e.status}:${e.content}`).join();
    if (planHash === this.lastPlanHash) return;
    this.lastPlanHash = planHash;

    const completed = entries.filter((e) => e.status === "completed").length;
    const total = entries.length;

    const planItems = entries
      .map((entry) => {
        const marker =
          entry.status === "completed"
            ? "\x1b[32m✓\x1b[0m"
            : entry.status === "in_progress"
              ? "\x1b[33m→\x1b[0m"
              : "\x1b[2m○\x1b[0m";
        const text =
          entry.status === "completed"
            ? `\x1b[2m${entry.content}\x1b[0m`
            : entry.content;
        return `${marker} ${text}`;
      })
      .join("  ");

    console.log(`\x1b[2m[${completed}/${total}]\x1b[0m ${planItems}`);
  }
}
