import {
  parseOpenApiSpec,
  formatParametersSummary,
  type OpenAPIOperation,
} from "./openapi.js";
import chalk from "chalk";
import {
  fetchGraphQLSchema,
  type GraphQLOperation,
  type GraphQLOperationWithFieldMapping,
} from "./graphql.js";
import { MARKDOWN_TOOLS, type MarkdownTool } from "./markdown.js";
import { CodingClient } from "./acp.js";
import {
  buildOpenAPIPrompt,
  buildGraphQLPrompt,
  buildMarkdownPrompt,
} from "./prompts.js";
import { log, initLog } from "../shared/log.js";
import { pluralize } from "../shared/text.js";
import {
  selectCodingAgent,
  connectAgent,
  type CodingAgent,
  AgentSession,
} from "../shared/acp.js";
import {
  input,
  checkbox,
  spinner,
  intro,
  outro,
  note,
  log as promptLog,
  cancel,
  handleCancel,
} from "../shared/prompts.js";

function printHelp() {
  console.log(`Usage: mcp-farmer grow <feature> [options]

Generate MCP capabilities

Features:
  openapi      Provide OpenAPI specification, select endpoints and fields
  graphql      Provide GraphQL endpoint URL, select queries/mutations and fields
  markdown     Provide a docs directory, generate tools to browse/read/search

Options:
  --help       Show this help message

Examples:
  mcp-farmer grow openapi
  mcp-farmer grow graphql
  mcp-farmer grow markdown`);
}

function formatEndpointLabel(endpoint: OpenAPIOperation): string {
  const method = endpoint.method.padEnd(7);
  const params = formatParametersSummary(endpoint.parameters);
  const paramHint = params ? chalk.dim(` (${params})`) : "";
  return `${method} ${endpoint.path}${paramHint}`;
}

function formatEndpointHint(endpoint: OpenAPIOperation): string {
  return endpoint.summary || endpoint.description || endpoint.operationId || "";
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

    promptLog.step(`${labelPrefix}: ${op.name}`);

    const fieldChoices = op.returnFields.map((field) => {
      const parts = [field.type];
      if (field.required) parts.push("required");
      if (field.description) parts.push(field.description);
      return {
        value: field.name,
        name: field.name,
        description: parts.join(" · "),
        checked: true,
      };
    });

    try {
      const selectedFields = await checkbox({
        message: "Select output fields to include:",
        choices: fieldChoices,
      });

      result.push({
        ...op,
        selectedReturnFields:
          selectedFields.length > 0 ? selectedFields : undefined,
      });
    } catch (error) {
      handleCancel(error);
    }
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
    promptLog.error("Could not start the coding agent. Is it installed?");
    log("spawn_agent_failed", error);
    process.exit(1);
  }

  const { connection, process: agentProcess, sessionId } = session;

  try {
    const toolWord = pluralize("tool", toolCount);
    const workSpinner = spinner();
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
      outro("Done! Your new tools are ready to use.");
      promptLog.message(
        `What's next?\n` +
          `  mcp-farmer vet   See a report on your generated tools\n` +
          `  mcp-farmer try   Test your new tools interactively`,
      );
      log("session_completed", "end_turn");
    } else if (promptResult.stopReason === "cancelled") {
      client.stopSpinner("Cancelled");
      cancel("Generation was cancelled.");
      log("session_completed", "cancelled");
    } else {
      client.stopSpinner("Complete");
      outro("Generation complete.");
      promptLog.message(
        `What's next?\n` +
          `  mcp-farmer vet   See a report on your generated tools\n` +
          `  mcp-farmer try   Test your new tools interactively`,
      );
      log("session_completed", promptResult.stopReason);
    }

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    promptLog.error(`Something went wrong: ${message}`);
    log("agent_error", error);
    process.exit(1);
  } finally {
    agentProcess.kill();
  }
}

interface EndpointWithFieldMapping extends OpenAPIOperation {
  selectedResponseFields?: string[];
}

async function handleOpenApiFeature(): Promise<void> {
  note(
    "Provide a path to a local file or a URL to a remote OpenAPI document.\nSupports both JSON and YAML formats.",
    "OpenAPI Source",
  );

  let specPath: string;
  try {
    specPath = await input({
      message: "Path or URL to OpenAPI document:",
      validate(value) {
        if (!value || value.trim() === "") {
          return "Path or URL is required";
        }
        return true;
      },
    });
  } catch (error) {
    handleCancel(error);
  }

  const specSpinner = spinner();
  specSpinner.start("Fetching OpenAPI specification...");

  const result = await parseOpenApiSpec(specPath);
  if (!result.ok) {
    specSpinner.stop("Failed to load OpenAPI specification");
    promptLog.error(result.error);
    log("spec_load_failed", result.error);
    process.exit(1);
  }
  specSpinner.stop("OpenAPI specification loaded");
  log("spec_loaded", `${result.value.title} (OpenAPI ${result.value.version})`);

  const { version, title, endpoints } = result.value;
  promptLog.info(`Loaded: ${title} (OpenAPI ${version})`);

  if (endpoints.length === 0) {
    promptLog.warn("No endpoints found in the OpenAPI specification.");
    process.exit(0);
  }

  promptLog.info(`Found ${endpoints.length} endpoint(s)`);

  const endpointChoices = endpoints.map((endpoint, index) => ({
    value: index,
    name: formatEndpointLabel(endpoint),
    description: formatEndpointHint(endpoint),
  }));

  let selectedIndices: number[];
  try {
    selectedIndices = await checkbox({
      message: "Select endpoints to generate tools for:",
      choices: endpointChoices,
    });

    if (selectedIndices.length === 0) {
      cancel("At least one endpoint must be selected.");
      process.exit(0);
    }
  } catch (error) {
    handleCancel(error);
  }

  const selectedEndpoints = selectedIndices
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

    promptLog.step(`${endpoint.method} ${endpoint.path}`);

    const fieldChoices = responseFields.map((field) => {
      const parts = [field.type];

      if (field.required) {
        parts.push("required");
      }

      if (field.description) {
        parts.push(field.description);
      }

      return {
        value: field.name,
        name: field.name,
        description: parts.join(" · "),
        checked: true,
      };
    });

    try {
      const selectedFields = await checkbox({
        message: "Select response fields to include in the tool output:",
        choices: fieldChoices,
      });

      endpointsWithMapping.push({
        ...endpoint,
        selectedResponseFields:
          selectedFields.length > 0 ? selectedFields : undefined,
      });
    } catch (error) {
      handleCancel(error);
    }
  }

  const agentChoice = await selectCodingAgent();
  if (!agentChoice) {
    log("cancelled", "agent selection");
    process.exit(0);
  }

  log("selected_agent", agentChoice);

  const promptText = buildOpenAPIPrompt({
    cwd: process.cwd(),
    endpoints: JSON.stringify(endpointsWithMapping, null, 2),
  });

  await runAgentWithPrompt(
    agentChoice,
    promptText,
    endpointsWithMapping.length,
  );
}

async function handleGraphQLFeature(): Promise<void> {
  note(
    "Provide a URL to a GraphQL endpoint.\nIntrospection will be used to fetch the schema.",
    "GraphQL Source",
  );

  let endpointUrl: string;
  try {
    endpointUrl = await input({
      message: "GraphQL endpoint URL:",
      validate(value) {
        if (!value || value.trim() === "") {
          return "URL is required";
        }
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
          return "URL must start with http:// or https://";
        }
        return true;
      },
    });
  } catch (error) {
    handleCancel(error);
  }

  const schemaSpinner = spinner();
  schemaSpinner.start("Fetching GraphQL schema via introspection...");

  const result = await fetchGraphQLSchema(endpointUrl);
  if (!result.ok) {
    schemaSpinner.stop("Failed to load GraphQL schema");
    promptLog.error(result.error);
    log("schema_load_failed", result.error);
    process.exit(1);
  }
  schemaSpinner.stop("GraphQL schema loaded");
  log("schema_loaded", result.value.title || endpointUrl);

  const { queries, mutations, title } = result.value;
  if (title) {
    promptLog.info(`Loaded: ${title}`);
  }
  promptLog.info(
    `Found ${queries.length} query(ies) and ${mutations.length} mutation(s)`,
  );

  if (queries.length === 0 && mutations.length === 0) {
    promptLog.warn("No queries or mutations found in the GraphQL schema.");
    process.exit(0);
  }

  const selectedOperations: GraphQLOperationWithFieldMapping[] = [];

  // Select queries
  if (queries.length > 0) {
    const queryChoices = queries.map((query, index) => ({
      value: index,
      name: formatOperationLabel(query),
      description: formatOperationHint(query),
    }));

    try {
      const selectedQueryIndices = await checkbox({
        message: "Select queries to generate tools for:",
        choices: queryChoices,
      });

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
    } catch (error) {
      handleCancel(error);
    }
  }

  // Select mutations
  if (mutations.length > 0) {
    const mutationChoices = mutations.map((mutation, index) => ({
      value: index,
      name: formatOperationLabel(mutation),
      description: formatOperationHint(mutation),
    }));

    try {
      const selectedMutationIndices = await checkbox({
        message: "Select mutations to generate tools for:",
        choices: mutationChoices,
      });

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
    } catch (error) {
      handleCancel(error);
    }
  }

  if (selectedOperations.length === 0) {
    promptLog.warn("No operations selected.");
    log("cancelled", "no operations selected");
    process.exit(0);
  }

  const agentChoice = await selectCodingAgent();
  if (!agentChoice) {
    log("cancelled", "agent selection");
    process.exit(0);
  }

  log("selected_agent", agentChoice);

  const promptText = buildGraphQLPrompt({
    cwd: process.cwd(),
    operations: JSON.stringify(selectedOperations, null, 2),
  });

  await runAgentWithPrompt(agentChoice, promptText, selectedOperations.length);
}

async function handleMarkdownFeature(): Promise<void> {
  note(
    "Generate tools for browsing and reading markdown documentation.\nThe generated tools will read from DOCS_PATH environment variable.",
    "Markdown Docs Tools",
  );

  const toolChoices = MARKDOWN_TOOLS.map((tool, index) => ({
    value: index,
    name: tool.name,
    description: tool.description,
    checked: true,
  }));

  let selectedIndices: number[];
  try {
    selectedIndices = await checkbox({
      message: "Select tools to generate:",
      choices: toolChoices,
    });

    if (selectedIndices.length === 0) {
      cancel("At least one tool must be selected.");
      process.exit(0);
    }
  } catch (error) {
    handleCancel(error);
  }

  const selectedTools = selectedIndices
    .map((i) => MARKDOWN_TOOLS[i])
    .filter((t): t is MarkdownTool => t !== undefined);

  log(
    "selected_tools",
    selectedTools.map((t) => t.name).join(", "),
  );

  const agentChoice = await selectCodingAgent();
  if (!agentChoice) {
    log("cancelled", "agent selection");
    process.exit(0);
  }

  log("selected_agent", agentChoice);

  const promptText = buildMarkdownPrompt({
    cwd: process.cwd(),
    tools: JSON.stringify(selectedTools, null, 2),
  });

  await runAgentWithPrompt(agentChoice, promptText, selectedTools.length);
}

export async function growCommand(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  initLog("grow");

  intro("Grow MCP Tools");

  if (args.length === 0) {
    promptLog.error("Please provide a feature you would like to grow");
    printHelp();
    process.exit(2);
  }

  const feature = args[0];

  if (feature === "openapi") {
    await handleOpenApiFeature();
  } else if (feature === "graphql") {
    await handleGraphQLFeature();
  } else if (feature === "markdown") {
    await handleMarkdownFeature();
  } else {
    promptLog.error(
      `Invalid feature: ${feature}. Valid features are: openapi, graphql, markdown`,
    );
    printHelp();
    process.exit(2);
  }
}
