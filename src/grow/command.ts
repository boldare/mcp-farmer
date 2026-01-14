import * as p from "@clack/prompts";
import * as acp from "@agentclientprotocol/sdk";
import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { parseOpenApiSpec, type OpenAPIOperation } from "./openapi.js";
import {
  fetchGraphQLSchema,
  type GraphQLOperation,
  type GraphQLOperationWithFieldMapping,
} from "./graphql.js";
import { CodingClient } from "./acp.js";
import { log, initLog } from "./log.js";

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
  graphql      Provide GraphQL endpoint URL, select queries/mutations and fields

Options:
  --help       Show this help message

Examples:
  mcp-farmer grow openapi
  mcp-farmer grow graphql`);
}

function formatEndpointLabel(endpoint: OpenAPIOperation): string {
  const method = endpoint.method.padEnd(7);
  return `${method} ${endpoint.path}`;
}

function formatEndpointHint(endpoint: OpenAPIOperation): string {
  return endpoint.summary || endpoint.operationId || "";
}

function formatOperationLabel(operation: GraphQLOperation): string {
  const type = operation.operationType.toUpperCase().padEnd(8);
  return `${type} ${operation.name}`;
}

function formatOperationHint(operation: GraphQLOperation): string {
  const parts: string[] = [];
  if (operation.arguments && operation.arguments.length > 0) {
    parts.push(`${operation.arguments.length} arg(s)`);
  }
  parts.push(`→ ${operation.returnType}`);
  if (operation.description) {
    parts.push(operation.description);
  }
  return parts.join(" · ");
}

async function selectFieldsForOperations(
  operations: GraphQLOperation[],
  indices: number[],
  labelPrefix: string,
): Promise<GraphQLOperationWithFieldMapping[]> {
  const result: GraphQLOperationWithFieldMapping[] = [];

  for (const index of indices) {
    const op = operations[index];
    if (!op) continue;

    if (!op.returnFields || op.returnFields.length === 0) {
      result.push(op);
      continue;
    }

    p.log.step(`${labelPrefix}: ${op.name}`);

    const fieldOptions = op.returnFields.map((field) => {
      const parts = [field.type];
      if (field.required) parts.push("required");
      if (field.description) parts.push(field.description);
      return { value: field.name, label: field.name, hint: parts.join(" · ") };
    });

    const selectedFields = await p.multiselect({
      message: "Select output fields to include:",
      options: fieldOptions,
      required: false,
      initialValues: op.returnFields.map((f) => f.name),
    });

    if (p.isCancel(selectedFields)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }

    result.push({
      ...op,
      selectedReturnFields:
        selectedFields.length > 0 ? selectedFields : undefined,
    });
  }

  return result;
}

async function selectCodingAgent(): Promise<CodingAgent | null> {
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
    return null;
  }

  return agentChoice;
}

async function runAgentWithPrompt(
  agentChoice: CodingAgent,
  promptText: string,
  taskDescription: string,
): Promise<void> {
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
  } catch (error) {
    agentSpinner.stop("Failed to start agent");
    p.log.error("Failed to spawn agent process");
    log("spawn_agent_failed", error);
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
    log(
      "agent_connected",
      `${initResult.agentInfo.name} ${initResult.agentInfo.version}`,
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
    log("session_created", sessionResult.models.currentModelId);

    p.note(taskDescription, "Agent Task");

    console.log();

    const promptResult = await connection.prompt({
      sessionId: sessionResult.sessionId,
      prompt: [
        {
          type: "text",
          text: promptText,
        },
      ],
    });

    console.log();

    if (promptResult.stopReason === "end_turn") {
      p.outro("MCP tools generated successfully!");
      log("session_completed", "end_turn");
    } else if (promptResult.stopReason === "cancelled") {
      p.cancel("Generation cancelled");
      log("session_completed", "cancelled");
    } else {
      p.log.info(`Agent stopped: ${promptResult.stopReason}`);
      p.outro("Generation complete");
      log("session_completed", promptResult.stopReason);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(`Agent error: ${message}`);
    log("agent_error", error);
    process.exit(1);
  } finally {
    agentProcess.kill();
  }
}

async function handleOpenApiFeature(): Promise<void> {
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
    log("spec_load_failed", result.error);
    process.exit(1);
  }
  specSpinner.stop("OpenAPI specification loaded");
  log("spec_loaded", `${result.value.title} (OpenAPI ${result.value.version})`);

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
    log("cancelled", "endpoint selection");
    process.exit(0);
  }

  const selectedEndpoints = selectedIndices
    .map((i) => endpoints[i])
    .filter((ep) => ep !== undefined);

  log(
    "selected_endpoints",
    selectedEndpoints.map((ep) => `${ep.method} ${ep.path}`).join(", "),
  );

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

  const agentChoice = await selectCodingAgent();
  if (!agentChoice) {
    log("cancelled", "agent selection");
    process.exit(0);
  }

  log("selected_agent", agentChoice);

  const promptText = `Your job is to generate MCP tools from the OpenAPI specification. You will be given a list of endpoints and you will need to generate a tool for each endpoint.

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
`;

  await runAgentWithPrompt(
    agentChoice,
    promptText,
    `Generating ${endpointsWithMapping.length} MCP tool(s) from OpenAPI endpoints`,
  );
}

async function handleGraphQLFeature(): Promise<void> {
  p.note(
    "Provide a URL to a GraphQL endpoint.\nIntrospection will be used to fetch the schema.",
    "GraphQL Source",
  );

  const endpointUrl = await p.text({
    message: "GraphQL endpoint URL:",
    placeholder: "https://api.example.com/graphql",
    validate(value) {
      if (!value || value.trim() === "") {
        return "URL is required";
      }
      if (!value.startsWith("http://") && !value.startsWith("https://")) {
        return "URL must start with http:// or https://";
      }
    },
  });

  if (p.isCancel(endpointUrl)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const schemaSpinner = p.spinner();
  schemaSpinner.start("Fetching GraphQL schema via introspection...");

  const result = await fetchGraphQLSchema(endpointUrl);
  if (!result.ok) {
    schemaSpinner.stop("Failed to load GraphQL schema");
    p.log.error(result.error);
    log("schema_load_failed", result.error);
    process.exit(1);
  }
  schemaSpinner.stop("GraphQL schema loaded");
  log("schema_loaded", result.value.title || endpointUrl);

  const { queries, mutations, title } = result.value;
  if (title) {
    p.log.info(`Loaded: ${title}`);
  }
  p.log.info(
    `Found ${queries.length} query(ies) and ${mutations.length} mutation(s)`,
  );

  if (queries.length === 0 && mutations.length === 0) {
    p.log.warn("No queries or mutations found in the GraphQL schema.");
    process.exit(0);
  }

  const selectedOperations: GraphQLOperationWithFieldMapping[] = [];

  // Select queries
  if (queries.length > 0) {
    const queryOptions = queries.map((query, index) => ({
      value: index,
      label: formatOperationLabel(query),
      hint: formatOperationHint(query),
    }));

    const selectedQueryIndices = await p.multiselect({
      message: "Select queries to generate tools for:",
      options: queryOptions,
      required: false,
    });

    if (p.isCancel(selectedQueryIndices)) {
      p.cancel("Operation cancelled.");
      log("cancelled", "query selection");
      process.exit(0);
    }

    const selectedQueries = await selectFieldsForOperations(
      queries,
      selectedQueryIndices,
      "Query",
    );
    selectedOperations.push(...selectedQueries);

    if (selectedQueryIndices.length > 0) {
      const queryNames = selectedQueryIndices
        .map((i) => queries[i]?.name)
        .filter(Boolean)
        .join(", ");
      log("selected_queries", queryNames);
    }
  }

  // Select mutations
  if (mutations.length > 0) {
    const mutationOptions = mutations.map((mutation, index) => ({
      value: index,
      label: formatOperationLabel(mutation),
      hint: formatOperationHint(mutation),
    }));

    const selectedMutationIndices = await p.multiselect({
      message: "Select mutations to generate tools for:",
      options: mutationOptions,
      required: false,
    });

    if (p.isCancel(selectedMutationIndices)) {
      p.cancel("Operation cancelled.");
      log("cancelled", "mutation selection");
      process.exit(0);
    }

    const selectedMutations = await selectFieldsForOperations(
      mutations,
      selectedMutationIndices,
      "Mutation",
    );
    selectedOperations.push(...selectedMutations);

    if (selectedMutationIndices.length > 0) {
      const mutationNames = selectedMutationIndices
        .map((i) => mutations[i]?.name)
        .filter(Boolean)
        .join(", ");
      log("selected_mutations", mutationNames);
    }
  }

  if (selectedOperations.length === 0) {
    p.log.warn("No operations selected.");
    log("cancelled", "no operations selected");
    process.exit(0);
  }

  const agentChoice = await selectCodingAgent();
  if (!agentChoice) {
    log("cancelled", "agent selection");
    process.exit(0);
  }

  log("selected_agent", agentChoice);

  const promptText = `Your job is to generate MCP tools from the GraphQL schema. You will be given a list of operations (queries and mutations) and you will need to generate a tool for each operation.

## Steps
1. Read current directory to see how the tools are structured and registered in the server instance
2. Identify any existing patterns in the codebase to follow
3. Confirm no duplicate tool names exist in the codebase
4. Generate the tool for each selected operation
5. Register the tool using the server instance

## Rules
- Place each tool in the tools directory as a separate file unless there is already another pattern in the project then you should follow it
- Each function should accept a server instance argument and register the tool using the server instance.
- Make a GraphQL request for each operation.
- Take the GraphQL endpoint from GRAPHQL_ENDPOINT environment variable.
- Use Zod schema for describing tool input and output.
- Every input parameter must have a .describe() in the Zod schema, if not provided from operation description use a useful but short description.
- Return only fields that are selected in the tool output (selectedReturnFields).
- Add tool annotations: { readOnlyHint: true } for queries, { destructiveHint: true } for mutations with "delete" in name

<current-directory>
${process.cwd()}
</current-directory>

<operations>
${JSON.stringify(selectedOperations, null, 2)}
</operations>
`;

  await runAgentWithPrompt(
    agentChoice,
    promptText,
    `Generating ${selectedOperations.length} MCP tool(s) from GraphQL operations`,
  );
}

export async function growCommand(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  initLog();

  p.intro("Grow MCP Tools");

  if (args.length === 0) {
    p.log.error("Please provide a feature you would like to grow");
    process.exit(1);
  }

  const feature = args[0];

  if (feature === "openapi") {
    await handleOpenApiFeature();
  } else if (feature === "graphql") {
    await handleGraphQLFeature();
  } else {
    p.log.error(
      `Invalid feature: ${feature}. Valid features are: openapi, graphql`,
    );
    process.exit(1);
  }
}
