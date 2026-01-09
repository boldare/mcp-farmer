import * as p from "@clack/prompts";
import * as acp from "@agentclientprotocol/sdk";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

import { parseOpenApiSpec, type OpenAPIOperation } from "./openapi.js";

function shortPath(filePath: string): string {
  const cwd = process.cwd();
  if (filePath.startsWith(cwd)) {
    return filePath.slice(cwd.length + 1);
  }
  return path.basename(filePath);
}

function formatDiffStats(additions: number, deletions: number): string {
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

  // Collect only changed lines with minimal context
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

  // Show only first 12 non-empty lines for new files
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

function getToolDisplayTitle(
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

function extractDiffFromContent(
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

function hashDiff(diff: acp.Diff): string {
  return `${diff.path}:${diff.newText.length}:${diff.oldText?.length || 0}`;
}

class CodingClient implements acp.Client {
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
    const content = await fs.readFile(params.path, "utf8");

    return {
      content: content,
    };
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
          if (update.content.type === "text" && update.content.text.trim()) {
            process.stdout.write(update.content.text);
          }
          break;

        case "agent_thought_chunk":
          if (update.content.type === "text" && update.content.text.trim()) {
            // Use stream for thought chunks with dim styling
            process.stdout.write(`\x1b[2m${update.content.text}\x1b[0m`);
          }
          break;

        case "tool_call": {
          const toolCallId = update.toolCallId;
          const title = update.title?.toLowerCase() || "";

          // Skip task logs for internal meta-operations
          if (title === "todowrite") {
            this.suppressedToolCalls.add(toolCallId);
            break;
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
          break;
        }

        case "tool_call_update": {
          const toolCallId = update.toolCallId;
          const status = update.status;
          const kind = update.kind?.toString() || "other";
          const title = update.title || "";
          const locations = update.locations || [];
          const content = update.content;

          // Skip updates for suppressed tool calls
          if (this.suppressedToolCalls.has(toolCallId)) {
            if (status === "completed" || status === "failed") {
              this.suppressedToolCalls.delete(toolCallId);
            }
            break;
          }

          const activeTask = this.activeTaskLogs.get(toolCallId);

          // Handle in_progress updates - show location only if changed
          if (status === "in_progress" && activeTask) {
            const firstLocation = locations[0];
            const currentPath = firstLocation?.path;

            if (currentPath && activeTask.displayedPath !== currentPath) {
              activeTask.displayedPath = currentPath;
              activeTask.log.message(shortPath(currentPath));
            }
          }

          // Handle completion - show diff and final status
          if (status === "completed" || status === "failed") {
            const diff = extractDiffFromContent(content);
            let diffInfo = "";
            let displayText = title;

            if (kind === "edit" && diff) {
              const currentHash = hashDiff(diff);
              const newLines = diff.newText.split("\n").length;
              const oldLines = diff.oldText
                ? diff.oldText.split("\n").length
                : 0;
              diffInfo = formatDiffStats(newLines, oldLines);
              displayText = shortPath(diff.path);

              // Show diff only if not already displayed
              if (!activeTask?.displayedDiffHash) {
                if (diff.oldText) {
                  displayDiffContent(diff.oldText, diff.newText, diff.path);
                } else {
                  displayNewFileContent(diff.newText, diff.path);
                }
                if (activeTask) activeTask.displayedDiffHash = currentHash;
              }
            } else {
              const firstLocation = locations[0];
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
          break;
        }

        case "plan": {
          const entries = update.entries;
          if (!entries || entries.length === 0) break;

          // Only show plan if there are pending/in_progress items
          const hasActive = entries.some((e) => e.status !== "completed");
          if (!hasActive) break;

          // Create a hash to avoid duplicate prints
          const planHash = entries
            .map((e) => `${e.status}:${e.content}`)
            .join();
          if (planHash === this.lastPlanHash) break;
          this.lastPlanHash = planHash;

          const completed = entries.filter(
            (e) => e.status === "completed",
          ).length;
          const total = entries.length;

          // Compact plan display
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
          break;
        }
      }
    } catch (error) {
      // Log errors but don't break the connection
      console.error(
        `\x1b[31mSession update error:\x1b[0m`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

export interface EndpointWithFieldMapping extends OpenAPIOperation {
  selectedResponseFields?: string[];
}

function printHelp() {
  console.log(`Usage: mcp-farmer grow <feature> [options]

Generate MCP capabilities

Features:
  openapi      Provide OpenAPI specification, select endpoints and fields

Options:
  --help       Show this help message

Examples:
  mcp-farmer grow`);
}

function formatEndpointLabel(endpoint: OpenAPIOperation): string {
  const method = endpoint.method.padEnd(7);
  return `${method} ${endpoint.path}`;
}

function formatEndpointHint(endpoint: OpenAPIOperation): string {
  return endpoint.summary || endpoint.operationId || "";
}

export async function growCommand(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  p.intro("Grow MCP Tools");

  if (args.length === 0) {
    p.log.error("Please provide a feature you woud like to grow");
    return;
  }

  if (args[0] !== "openapi") {
    p.log.error("Invalid feature given");
  }

  p.note(
    "Provide a path to a local file or a URL to a remote OpenAPI document.\nSupports both JSON and YAML formats.",
    "OpenAPI Source",
  );

  const specPath = await p.text({
    message: "Path or URL to OpenAPI document:",
    placeholder: "./openapi.json or https://api.example.com/openapi.json",
    validate(value) {
      if (!value || value.trim() === "") {
        return "Path or URL is required";
      }
    },
  });

  if (p.isCancel(specPath)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const specSpinner = p.spinner();
  specSpinner.start("Fetching OpenAPI specification...");

  const result = await parseOpenApiSpec(specPath);
  if (!result.ok) {
    specSpinner.stop("Failed to load OpenAPI specification");
    p.log.error(result.error);
    process.exit(1);
  }
  specSpinner.stop("OpenAPI specification loaded");

  const { version, title, endpoints } = result.value;
  p.log.info(`Loaded: ${title} (OpenAPI ${version})`);

  if (endpoints.length === 0) {
    p.log.warn("No endpoints found in the OpenAPI specification.");
    process.exit(0);
  }

  p.log.info(`Found ${endpoints.length} endpoint(s)`);

  const endpointOptions = endpoints.map((endpoint, index) => ({
    value: index,
    label: formatEndpointLabel(endpoint),
    hint: formatEndpointHint(endpoint),
  }));

  const selectedIndices = await p.multiselect({
    message: "Select endpoints to generate tools for:",
    options: endpointOptions,
    required: true,
  });

  if (p.isCancel(selectedIndices)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const selectedEndpoints = selectedIndices
    .map((i) => endpoints[i])
    .filter((ep) => ep !== undefined);

  const endpointsWithMapping: EndpointWithFieldMapping[] = [];

  for (const endpoint of selectedEndpoints) {
    const responseFields = endpoint.responses?.[0]?.fields ?? [];
    if (responseFields.length === 0) {
      endpointsWithMapping.push(endpoint);
      continue;
    }

    p.log.step(`${endpoint.method} ${endpoint.path}`);

    const fieldOptions = responseFields.map((field) => {
      const parts = [field.type];

      if (field.required) {
        parts.push("required");
      }

      if (field.description) {
        parts.push(field.description);
      }

      return {
        value: field.name,
        label: field.name,
        hint: parts.join(" · "),
      };
    });

    const selectedFields = await p.multiselect({
      message: "Select response fields to include in the tool output:",
      options: fieldOptions,
      required: false,
      initialValues: responseFields.map((f) => f.name), // All selected by default
    });

    if (p.isCancel(selectedFields)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }

    endpointsWithMapping.push({
      ...endpoint,
      selectedResponseFields:
        selectedFields.length > 0 ? selectedFields : undefined,
    });
  }

  const agentSpinner = p.spinner();
  agentSpinner.start("Starting OpenCode coding agent...");

  const agentProcess = spawn("opencode", ["acp"]);

  if (!agentProcess.stdin || !agentProcess.stdout) {
    agentSpinner.stop("Failed to start agent");
    p.log.error("Failed to spawn agent process");
    process.exit(1);
  }

  const input = Writable.toWeb(agentProcess.stdin);
  const output = Readable.toWeb(
    agentProcess.stdout,
  ) as ReadableStream<Uint8Array>;

  // Create the client connection
  const client = new CodingClient();
  const agentStream = acp.ndJsonStream(input, output);
  const connection = new acp.ClientSideConnection(() => client, agentStream);

  try {
    // Initialize the connection
    const initResult = await connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    });

    agentSpinner.stop(
      `Connected to agent ${initResult.agentInfo.name} ${initResult.agentInfo.version} via ACP protocol`,
    );

    // Create a new session
    const sessionSpinner = p.spinner();
    sessionSpinner.start("Creating session...");

    const sessionResult = await connection.newSession({
      cwd: process.cwd(),
      mcpServers: [],
    });

    sessionSpinner.stop(
      `Created new session and will use the ${sessionResult.models.currentModelId}`,
    );

    p.note(
      `Generating ${endpointsWithMapping.length} MCP tool(s) from OpenAPI endpoints`,
      "Agent Task",
    );

    console.log(); // Add spacing before agent output

    const promptResult = await connection.prompt({
      sessionId: sessionResult.sessionId,
      prompt: [
        {
          type: "text",
          text: `Your job is to generate MCP tools from the OpenAPI specification. You will be given a list of endpoints and you will need to generate a tool for each endpoint. Follow these instructions:

          - Place each tool in the tools directory as a separate file.
          - Each function should accept a server instance argument and register the tool using the server instance.
          - You should make a fetch request for each endpoint.
          - You can take the base url from API_BASE_URL environment variable.
          - For tool input write Zod schema, if any description is provided, use it in the schema if not generate useful but short description.
          - For tool output use the Zod schema and return only fields that are selected.

          <current-directory>
          ${process.cwd()}
          </current-directory>

          <endpoints>
          ${JSON.stringify(endpointsWithMapping, null, 2)}
          </endpoints>
          `,
        },
      ],
    });

    console.log(); // Add spacing after agent output

    if (promptResult.stopReason === "end_turn") {
      p.outro("MCP tools generated successfully!");
    } else if (promptResult.stopReason === "cancelled") {
      p.cancel("Generation cancelled");
    } else {
      p.log.info(`Agent stopped: ${promptResult.stopReason}`);
      p.outro("Generation complete");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(`Agent error: ${message}`);
    process.exit(1);
  } finally {
    agentProcess.kill();
  }
}
