import * as p from "@clack/prompts";
import * as acp from "@agentclientprotocol/sdk";
import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { log } from "./log.js";

export type CodingAgent =
  | "opencode"
  | "claude-code"
  | "gemini-cli"
  | "github-copilot-cli";

export const AGENT_LABELS: Record<CodingAgent, string> = {
  opencode: "OpenCode",
  "claude-code": "Claude Code",
  "gemini-cli": "Gemini CLI",
  "github-copilot-cli": "GitHub Copilot CLI",
};

export interface AgentSession {
  connection: acp.ClientSideConnection;
  process: ChildProcess;
  sessionId: string;
  selectedModel?: string;
}

export interface RunAgentOptions<TClient extends acp.Client> {
  agent: CodingAgent;
  clientFactory: () => TClient;
  clientCapabilities?: acp.ClientCapabilities;
  mcpServers?: acp.McpServer[];
  enableModelSelection?: boolean;
  onClientReady?: (client: TClient) => void;
}

// Core spawning logic
export function spawnAgentProcess(agent: CodingAgent): ChildProcess {
  switch (agent) {
    case "opencode":
      return spawn("opencode", ["acp"]);
    case "gemini-cli":
      return spawn("gemini", ["--experimental-acp"]);
    case "github-copilot-cli":
      return spawn("copilot", ["--acp"]);
    case "claude-code": {
      const path = fileURLToPath(
        import.meta.resolve("@zed-industries/claude-code-acp/dist/index.js"),
      );
      return spawn(process.execPath, [path]);
    }
  }
}

// Agent selection with configurable options
export interface SelectAgentOptions {
  agents?: CodingAgent[];
}

export async function selectCodingAgent(
  options: SelectAgentOptions = {},
): Promise<CodingAgent | null> {
  const agents = options.agents ?? [
    "opencode",
    "claude-code",
    "gemini-cli",
    "github-copilot-cli",
  ];

  const agentChoice = await p.select({
    message: "Select a coding agent:",
    options: agents.map((agent) => ({
      value: agent,
      label: AGENT_LABELS[agent],
      hint: getAgentHint(agent),
    })),
  });

  if (p.isCancel(agentChoice)) {
    p.cancel("Operation cancelled.");
    return null;
  }

  return agentChoice as CodingAgent;
}

function getAgentHint(agent: CodingAgent): string {
  const hints: Record<CodingAgent, string> = {
    opencode: "opencode",
    "claude-code": "claude-code-acp",
    "gemini-cli": "gemini --experimental-acp",
    "github-copilot-cli": "copilot --acp",
  };
  return hints[agent];
}

// Model selection as standalone function
export async function promptModelSelection(
  connection: acp.ClientSideConnection,
  sessionResult: acp.NewSessionResponse,
): Promise<string | undefined> {
  const { currentModelId, availableModels } = sessionResult.models ?? {};

  if (!availableModels || availableModels.length <= 1) {
    return currentModelId;
  }

  const defaultId = currentModelId || availableModels[0]?.modelId || "";
  const defaultName =
    availableModels.find((m) => m.modelId === currentModelId)?.name ??
    currentModelId ??
    "default";

  const modelChoice = await p.select({
    message: "Select a model:",
    options: [
      {
        value: defaultId,
        label: `Use default (${defaultName})`,
        hint: "recommended",
      },
      ...availableModels
        .filter((m) => m.modelId !== defaultId)
        .map((m) => ({ value: m.modelId, label: m.name })),
    ],
  });

  if (p.isCancel(modelChoice)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (modelChoice !== currentModelId) {
    await connection.unstable_setSessionModel({
      modelId: modelChoice as string,
      providerId: (modelChoice as string).split("/")[0] || "",
      sessionId: sessionResult.sessionId,
    });
    log("session_model_set", modelChoice as string);
  }

  return modelChoice as string;
}

// High-level runner that handles connection lifecycle
export async function connectAgent<TClient extends acp.Client>(
  options: RunAgentOptions<TClient>,
): Promise<{ session: AgentSession; client: TClient }> {
  const spinner = p.spinner();
  const label = AGENT_LABELS[options.agent];
  spinner.start(`Connecting to ${label}...`);

  const agentProcess = spawnAgentProcess(options.agent);

  if (!agentProcess.stdin || !agentProcess.stdout) {
    spinner.stop("Failed to connect");
    throw new Error("Failed to spawn agent process");
  }

  const input = Writable.toWeb(agentProcess.stdin);
  const output = Readable.toWeb(
    agentProcess.stdout,
  ) as ReadableStream<Uint8Array>;

  const client = options.clientFactory();
  const stream = acp.ndJsonStream(input, output);
  const connection = new acp.ClientSideConnection(() => client, stream);

  const initResult = await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: options.clientCapabilities ?? {},
  });

  log(
    "agent_connected",
    `${initResult.agentInfo.name} ${initResult.agentInfo.version}`,
  );

  const sessionResult = await connection.newSession({
    cwd: process.cwd(),
    mcpServers: options.mcpServers ?? [],
  });

  spinner.stop(`Connected to ${label}`);

  let selectedModel: string | undefined;
  if (options.enableModelSelection) {
    selectedModel = await promptModelSelection(connection, sessionResult);
  }

  log("session_created", selectedModel || "default");

  if (options.onClientReady) {
    options.onClientReady(client);
  }

  return {
    session: {
      connection,
      process: agentProcess,
      sessionId: sessionResult.sessionId,
      selectedModel,
    },
    client,
  };
}

// Shared permission handler that can be mixed into any client
export function createPermissionHandler(
  getSpinner: () => ReturnType<typeof p.spinner> | null,
  getProgressMessage: () => string,
) {
  return async function requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    const spinner = getSpinner();
    if (spinner) spinner.stop("Permission required");

    log("permission_requested", params.toolCall.title || undefined);

    const response = await p.select({
      message: "Agent needs permission to proceed:",
      options: params.options.map((opt) => ({
        value: opt.optionId,
        label: opt.name,
        hint: opt.kind,
      })),
    });

    if (p.isCancel(response)) {
      log("permission_cancelled", params.toolCall.title || undefined);
      return { outcome: { outcome: "cancelled" } };
    }

    log("permission_granted", `${params.toolCall.title}: ${response}`);

    if (spinner) spinner.start(getProgressMessage());

    return { outcome: { outcome: "selected", optionId: response as string } };
  };
}

// Shared session update handler
export interface SessionUpdateHandlers {
  onToolCall: (update: acp.ToolCall) => void;
  onToolCallUpdate: (update: acp.ToolCallUpdate) => void;
  suppressedCalls?: Set<string>;
}

export function createSessionUpdateHandler(handlers: SessionUpdateHandlers) {
  const suppressed = handlers.suppressedCalls ?? new Set<string>();

  return async function sessionUpdate({
    update,
  }: acp.SessionNotification): Promise<void> {
    try {
      if (update.sessionUpdate === "tool_call") {
        const title = update.title?.toLowerCase() || "";
        if (title === "todowrite") {
          suppressed.add(update.toolCallId);
          return;
        }
        log("tool_call_started", update.title || "unknown");
        handlers.onToolCall(update);
      } else if (update.sessionUpdate === "tool_call_update") {
        if (suppressed.has(update.toolCallId)) {
          if (update.status === "completed" || update.status === "failed") {
            suppressed.delete(update.toolCallId);
          }
          return;
        }
        handlers.onToolCallUpdate(update);
      }
    } catch (error) {
      log("session_update_error", error);
    }
  };
}
