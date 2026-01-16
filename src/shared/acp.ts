import * as acp from "@agentclientprotocol/sdk";
import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { log } from "./log.js";
import {
  select,
  spinner,
  cancel,
  handleCancel,
  type SpinnerInstance,
} from "./prompts.js";

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

function spawnAgentProcess(agent: CodingAgent): ChildProcess {
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

  try {
    const agentChoice = await select({
      message: "Select a coding agent:",
      choices: agents.map((agent) => ({
        value: agent,
        name: AGENT_LABELS[agent],
        description: getAgentHint(agent),
      })),
    });

    return agentChoice;
  } catch (error) {
    handleCancel(error);
  }
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

async function promptModelSelection(
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

  try {
    const modelChoice = await select({
      message: "Select a model:",
      choices: [
        {
          value: defaultId,
          name: `Use default (${defaultName})`,
          description: "recommended",
        },
        ...availableModels
          .filter((m) => m.modelId !== defaultId)
          .map((m) => ({ value: m.modelId, name: m.name })),
      ],
    });

    if (modelChoice !== currentModelId) {
      await connection.unstable_setSessionModel({
        modelId: modelChoice,
        providerId: modelChoice.split("/")[0] || "",
        sessionId: sessionResult.sessionId,
      });
      log("session_model_set", modelChoice);
    }

    return modelChoice;
  } catch (error) {
    handleCancel(error);
  }
}

// High-level runner that handles connection lifecycle
export async function connectAgent<TClient extends acp.Client>(
  options: RunAgentOptions<TClient>,
): Promise<{ session: AgentSession; client: TClient }> {
  // Increase max listeners to avoid warnings when many permission prompts are shown
  // Each @inquirer/prompts select call adds listeners to stdin
  process.stdin.setMaxListeners(100);

  const s = spinner();
  const label = AGENT_LABELS[options.agent];
  s.start(`Connecting to ${label}...`);

  const agentProcess = spawnAgentProcess(options.agent);

  if (!agentProcess.stdin || !agentProcess.stdout) {
    agentProcess.kill();
    s.stop("Failed to connect");
    throw new Error("Failed to spawn agent process");
  }

  const input = Writable.toWeb(agentProcess.stdin);
  const output = Readable.toWeb(
    agentProcess.stdout,
  ) as ReadableStream<Uint8Array>;

  const client = options.clientFactory();
  const stream = acp.ndJsonStream(input, output);
  const connection = new acp.ClientSideConnection(() => client, stream);

  try {
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

    s.stop(`Connected to ${label}`);

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
  } catch (error) {
    agentProcess.kill();
    s.stop("Failed to connect");
    throw error;
  }
}

// Shared permission handler that can be mixed into any client
export function createPermissionHandler(
  getSpinner: () => SpinnerInstance | null,
  getProgressMessage: () => string,
) {
  return async function requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    const currentSpinner = getSpinner();
    if (currentSpinner) currentSpinner.stop("Permission required");

    const title = params.toolCall.title || "Unknown action";
    log("permission_requested", title);

    try {
      const response = await select({
        message: `Allow "${title}"?`,
        choices: params.options.map((opt) => ({
          value: opt.optionId,
          name: opt.name,
          description: opt.kind,
        })),
      });

      log("permission_granted", `${title}: ${response}`);

      const spinnerAfter = getSpinner();
      if (spinnerAfter) {
        spinnerAfter.start(getProgressMessage());
      }

      return { outcome: { outcome: "selected", optionId: response } };
    } catch {
      log("permission_cancelled", title);
      cancel("Operation cancelled.");
      return { outcome: { outcome: "cancelled" } };
    }
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
