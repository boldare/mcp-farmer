import * as p from "@clack/prompts";

import { parseOpenApiSpec, type OpenAPIOperation } from "./openapi.js";
import {
  fetchGraphQLSchema,
  type GraphQLOperation,
  type GraphQLOperationWithFieldMapping,
} from "./graphql.js";
import { CodingClient } from "./acp.js";
import { log, initLog } from "../shared/log.js";
import {
  selectCodingAgent,
  connectAgent,
  type CodingAgent,
  AgentSession,
} from "../shared/acp.js";

export interface EndpointWithFieldMapping extends OpenAPIOperation {
  selectedResponseFields?: string[];
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
        (selectedFields as string[]).length > 0
          ? (selectedFields as string[])
          : undefined,
    });
  }

  return result;
}

async function runAgentWithPrompt(
  agentChoice: CodingAgent,
  promptText: string,
  toolCount: number,
): Promise<void> {
  let session: AgentSession;
  let client: CodingClient;

  try {
    const result = await connectAgent({
      agent: agentChoice,
      clientFactory: () => new CodingClient(),
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
      enableModelSelection: true,
    });
    session = result.session;
    client = result.client;
  } catch (error) {
    p.log.error("Could not start the coding agent. Is it installed?");
    log("spawn_agent_failed", error);
    process.exit(1);
  }

  const { connection, process: agentProcess, sessionId } = session;

  try {
    const toolWord = toolCount === 1 ? "tool" : "tools";
    const workSpinner = p.spinner();
    workSpinner.start(`Generating ${toolCount} ${toolWord}...`);

    client.setSpinner(workSpinner);

    const promptResult = await connection.prompt({
      sessionId,
      prompt: [
        {
          type: "text",
          text: promptText,
        },
      ],
    });

    if (promptResult.stopReason === "end_turn") {
      client.stopSpinner(`Generated ${toolCount} MCP ${toolWord}`);
      p.outro("Done! Your new tools are ready to use.");
      p.log.message(
        `What's next?\n` +
          `  mcp-farmer vet   See a report on your generated tools\n` +
          `  mcp-farmer try   Test your new tools interactively`,
      );
      log("session_completed", "end_turn");
    } else if (promptResult.stopReason === "cancelled") {
      client.stopSpinner("Cancelled");
      p.cancel("Generation was cancelled.");
      log("session_completed", "cancelled");
    } else {
      client.stopSpinner("Complete");
      p.outro("Generation complete.");
      p.log.message(
        `What's next?\n` +
          `  mcp-farmer vet   See a report on your generated tools\n` +
          `  mcp-farmer try   Test your new tools interactively`,
      );
      log("session_completed", promptResult.stopReason);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(`Something went wrong: ${message}`);
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

  const selectedEndpoints = (selectedIndices as number[])
    .map((i) => endpoints[i])
    .filter((ep): ep is OpenAPIOperation => ep !== undefined);

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
        (selectedFields as string[]).length > 0
          ? (selectedFields as string[])
          : undefined,
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
    endpointsWithMapping.length,
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
      selectedQueryIndices as number[],
      "Query",
    );
    selectedOperations.push(...selectedQueries);

    if ((selectedQueryIndices as number[]).length > 0) {
      const queryNames = (selectedQueryIndices as number[])
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
      selectedMutationIndices as number[],
      "Mutation",
    );
    selectedOperations.push(...selectedMutations);

    if ((selectedMutationIndices as number[]).length > 0) {
      const mutationNames = (selectedMutationIndices as number[])
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

  await runAgentWithPrompt(agentChoice, promptText, selectedOperations.length);
}

export async function growCommand(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  initLog("grow");

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
