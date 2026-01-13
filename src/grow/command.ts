import * as p from "@clack/prompts";
import * as acp from "@agentclientprotocol/sdk";
import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { parseOpenApiSpec, type OpenAPIOperation } from "./openapi.js";
import { CodingClient } from "./acp.js";

export interface EndpointWithFieldMapping extends OpenAPIOperation {
  selectedResponseFields?: string[];
}

type CodingAgent = "opencode" | "claude-code" | "gemini-cli";

interface AgentConnection {
  connection: acp.ClientSideConnection;
  process: ChildProcess;
}

function spawnAgent(agent: CodingAgent): AgentConnection {
  let agentProcess: ChildProcess;

  if (agent === "opencode") {
    agentProcess = spawn("opencode", ["acp"]);
  } else if (agent === "gemini-cli") {
    agentProcess = spawn("gemini", ["--experimental-acp"]);
  } else {
    // Resolve the path to the local claude-code-acp executable
    const claudeCodePath = fileURLToPath(
      import.meta.resolve("@zed-industries/claude-code-acp/dist/index.js"),
    );
    agentProcess = spawn(process.execPath, [claudeCodePath]);
  }

  if (!agentProcess.stdin || !agentProcess.stdout) {
    throw new Error("Failed to spawn agent process");
  }

  const input = Writable.toWeb(agentProcess.stdin);
  const output = Readable.toWeb(
    agentProcess.stdout,
  ) as ReadableStream<Uint8Array>;

  const client = new CodingClient();
  const agentStream = acp.ndJsonStream(input, output);
  const connection = new acp.ClientSideConnection(() => client, agentStream);

  return { connection, process: agentProcess };
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
    p.log.error("Please provide a feature you would like to grow");
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
      initialValues: responseFields.map((f) => f.name),
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

  const agentChoice = await p.select({
    message: "Select a coding agent:",
    options: [
      { value: "opencode" as CodingAgent, label: "OpenCode", hint: "opencode" },
      {
        value: "claude-code" as CodingAgent,
        label: "Claude Code",
        hint: "claude-code-acp",
      },
      {
        value: "gemini-cli" as CodingAgent,
        label: "Gemini CLI",
        hint: "gemini --experimental-acp",
      },
    ],
  });

  if (p.isCancel(agentChoice)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const labelMap = {
    opencode: "OpenCode",
    "gemini-cli": "Gemini CLI",
    "claude-code": "Claude Code",
  };

  const agentLabel = labelMap[agentChoice];
  const agentSpinner = p.spinner();
  agentSpinner.start(`Starting ${agentLabel} coding agent...`);

  let agent: AgentConnection;
  try {
    agent = spawnAgent(agentChoice);
  } catch {
    agentSpinner.stop("Failed to start agent");
    p.log.error("Failed to spawn agent process");
    process.exit(1);
  }

  const { connection, process: agentProcess } = agent;

  try {
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

    console.log();

    const promptResult = await connection.prompt({
      sessionId: sessionResult.sessionId,
      prompt: [
        {
          type: "text",
          text: `Your job is to generate MCP tools from the OpenAPI specification. You will be given a list of endpoints and you will need to generate a tool for each endpoint.

          ## Steps
          1. Read current directory to see how the tools are structured and registered in the server instance
          2. Identify any existing patterns in the codebase to follow
          3. Confirm no duplicate tool names exist in the codebase
          4. Generate the tool for each selected endpoint
          5. Register the tool using the server instance

          ## Rules
          - Place each tool in the tools directory as a separate file unless there is already another pattern in the project then you should follow it
          - Each function should accept a server instance argument and register the tool using the server instance.
          - You should make a fetch request for each endpoint.
          - You can take the base url from API_BASE_URL environment variable.
          - Use Zod schema for describing tool input and output.
          - Every input parameter must have a .describe() in the Zod schema, if not provided from endpoint description use a useful but short description.
          - Return only fields that are selected in the tool output.
          - Add tool annotations: { readOnlyHint: true } for GET requests, { destructiveHint: true } for DELETE

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

    console.log();

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
