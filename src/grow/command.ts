import * as p from "@clack/prompts";
import * as acp from "@agentclientprotocol/sdk";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";

import {
  fetchOpenApiSpec,
  extractEndpoints,
  getSpecVersion,
  type OpenAPIOperation,
  type OpenAPISpec,
  type ResponseField,
} from "./openapi.js";

function shortPath(filePath: string): string {
  const cwd = process.cwd();
  if (filePath.startsWith(cwd)) {
    return filePath.slice(cwd.length + 1);
  }
  return path.basename(filePath);
}

function formatDiff(additions: number, deletions: number): string {
  const parts: string[] = [];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  return parts.length > 0 ? ` (${parts.join(" ")})` : "";
}

interface ActiveTaskLog {
  log: ReturnType<typeof p.taskLog>;
  startTime: number;
}

interface ToolCallUpdate {
  kind?: string;
  title?: string;
}

function getToolDisplayTitle(update: ToolCallUpdate): string {
  const kind = update.kind?.toString() || "other";
  const title = update.title?.toLowerCase() || "";

  switch (kind) {
    case "edit":
      return "Writing file...";
    case "read":
      return title === "list" ? "Listing directory..." : "Reading file...";
    default:
      return update.title || "Running...";
  }
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

        const displayTitle = getToolDisplayTitle(update);
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

        // Skip updates for suppressed tool calls
        if (this.suppressedToolCalls.has(toolCallId)) {
          if (status === "completed" || status === "failed") {
            this.suppressedToolCalls.delete(toolCallId);
          }
          break;
        }

        const activeTask = this.activeTaskLogs.get(toolCallId);

        if (status === "completed" || status === "failed") {
          // Get file info for edits by extracting diff from content array
          let diffInfo = "";
          if (kind === "edit") {
            const contentArray = update.content as unknown[] | undefined;
            const diffEntry = contentArray?.find(
              (c): c is { type: "diff"; newText: string; oldText: string } =>
                typeof c === "object" &&
                c !== null &&
                (c as { type?: string }).type === "diff",
            );

            if (diffEntry) {
              const newLines = diffEntry.newText
                ? diffEntry.newText.split("\n").length
                : 0;
              const oldLines = diffEntry.oldText
                ? diffEntry.oldText.split("\n").length
                : 0;
              diffInfo = formatDiff(newLines, oldLines);
            }
          }

          // Determine what to show
          let displayText = title;
          const firstLocation = locations[0];
          if (firstLocation?.path) {
            displayText = shortPath(firstLocation.path);
          }

          const resultMessage = `${displayText}${diffInfo}`;

          if (activeTask) {
            if (status === "completed") {
              activeTask.log.success(resultMessage);
            } else {
              activeTask.log.error(resultMessage);
            }
            this.activeTaskLogs.delete(toolCallId);
          } else {
            // Fallback if no active task log
            if (status === "completed") {
              p.log.success(resultMessage);
            } else {
              p.log.error(resultMessage);
            }
          }
        } else if (status === "in_progress" && activeTask) {
          // Update the task log with progress info
          const firstLocation = locations[0];
          if (firstLocation?.path) {
            activeTask.log.message(shortPath(firstLocation.path));
          }
        }
        break;
      }

      case "plan": {
        const entries = update.entries as {
          content: string;
          status: string;
          priority?: string;
        }[];

        // Only show plan if there are pending/in_progress items
        const hasActive = entries.some((e) => e.status !== "completed");
        if (!hasActive) break;

        // Create a hash to avoid duplicate prints
        const planHash = entries.map((e) => `${e.status}:${e.content}`).join();
        if (planHash === this.lastPlanHash) break;
        this.lastPlanHash = planHash;

        const completed = entries.filter(
          (e) => e.status === "completed",
        ).length;
        const total = entries.length;

        // Build plan display using box
        const planLines: string[] = [];
        for (const entry of entries) {
          const marker =
            entry.status === "completed"
              ? "✓"
              : entry.status === "in_progress"
                ? "→"
                : "○";
          planLines.push(`${marker} ${entry.content}`);
        }

        p.box(planLines.join("\n"), `Plan (${completed}/${total})`, {
          contentAlign: "left",
          titleAlign: "left",
        });
        break;
      }
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
    p.log.error("Invalid feature given")
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

  let spec: OpenAPISpec;
  try {
    spec = await fetchOpenApiSpec(specPath);
    specSpinner.stop("OpenAPI specification loaded");
  } catch (error) {
    specSpinner.stop("Failed to load OpenAPI specification");
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(message);
    process.exit(1);
  }

  const specVersion = getSpecVersion(spec);
  if (!specVersion) {
    p.log.error(
      "Invalid OpenAPI document: missing 'openapi' or 'swagger' field",
    );
    process.exit(1);
  }
  const specTitle = spec.info?.title || "Unknown API";
  p.log.info(`Loaded: ${specTitle} (OpenAPI ${specVersion})`);

  const endpoints = extractEndpoints(spec);

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
    const responseFields = getResponseFields(endpoint);

    if (responseFields.length === 0) {
      endpointsWithMapping.push(endpoint);
      continue;
    }

    p.log.step(`${endpoint.method} ${endpoint.path}`);

    const fieldOptions = responseFields.map((field) => ({
      value: field.name,
      label: field.name,
      hint: formatFieldHint(field),
    }));

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
        (selectedFields as string[]).length > 0
          ? (selectedFields as string[])
          : undefined,
    });
  }

  const agentSpinner = p.spinner();
  agentSpinner.start("Starting coding agent...");

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

    sessionSpinner.stop(`Created new session and will use the ${sessionResult.models.currentModelId}`);

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
      p.outro("✨ MCP tools generated successfully!");
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

function getResponseFields(endpoint: OpenAPIOperation): ResponseField[] {
  const firstResponse = endpoint.responses?.[0];
  if (!firstResponse) {
    return [];
  }
  return firstResponse.fields;
}

function formatFieldHint(field: ResponseField): string {
  const parts: string[] = [field.type];
  if (field.required) {
    parts.push("required");
  }
  if (field.description) {
    parts.push(field.description);
  }
  return parts.join(" · ");
}
