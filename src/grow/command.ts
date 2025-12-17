import * as p from "@clack/prompts";
import * as acp from "@agentclientprotocol/sdk";
import * as fs from "node:fs/promises";
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

class CodingClient implements acp.Client {
  async requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    const response = await p.select({
      message: "Select an option:",
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
        if (update.content.type === "text") {
          process.stdout.write(update.content.text);
        }
        break;
      case "agent_thought_chunk":
        if (update.content.type === "text") {
          process.stdout.write(`\x1b[90m${update.content.text}\x1b[0m`);
        }
        break;
      case "tool_call":
        console.log(`\n\x1b[36m[tool] ${update.title}\x1b[0m`);
        break;
      case "tool_call_update":
        if (update.status === "completed" || update.status === "failed") {
          console.log(`  -> ${update.status}`);
        }
        break;
      case "plan":
        console.log(`\n\x1b[34m[plan]\x1b[0m`);
        for (const entry of update.entries) {
          const marker =
            entry.status === "completed"
              ? "[x]"
              : entry.status === "in_progress"
                ? "[>]"
                : "[ ]";
          console.log(`  ${marker} ${entry.content}`);
        }
        break;
    }
  }
}

export interface EndpointWithFieldMapping extends OpenAPIOperation {
  selectedResponseFields?: string[];
}

function printHelp() {
  console.log(`Usage: mcp-farmer grow [options]

Generate MCP tools from external sources like OpenAPI specifications.

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

  const sourceType = await p.select({
    message: "What type of tools do you want to add?",
    options: [
      {
        value: "openapi" as const,
        label: "OpenAPI specification",
        hint: "Generate tools from a Swagger/OpenAPI document",
      },
    ],
  });

  if (p.isCancel(sourceType)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
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

  const s = p.spinner();
  s.start("Fetching OpenAPI specification...");

  let spec: OpenAPISpec;
  try {
    spec = await fetchOpenApiSpec(specPath);
    s.stop("OpenAPI specification loaded");
  } catch (error) {
    s.stop("Failed to load OpenAPI specification");
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

  const agentProcess = spawn("opencode", ["acp"]);

  if (!agentProcess.stdin || !agentProcess.stdout) {
    throw new Error("Failed to spawn agent process");
  }

  const input = Writable.toWeb(agentProcess.stdin);
  const output = Readable.toWeb(
    agentProcess.stdout,
  ) as ReadableStream<Uint8Array>;

  // Create the client connection
  const client = new CodingClient();
  const stream = acp.ndJsonStream(input, output);
  const connection = new acp.ClientSideConnection(() => client, stream);

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

    console.log(
      `✅ Connected to agent (protocol v${initResult.protocolVersion})`,
    );

    // Create a new session
    const sessionResult = await connection.newSession({
      cwd: process.cwd(),
      mcpServers: [],
    });

    console.log(`📝 Created session: ${sessionResult.sessionId}`);

    const promptResult = await connection.prompt({
      sessionId: sessionResult.sessionId,
      prompt: [
        {
          type: "text",
          text: `Your job is to generate MCP tools from the OpenAPI specification. You will be given a list of endpoints and you will need to generate a tool for each endpoint. Follow these instructions:

          - Place each tool in the tools directory as a separate file.
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

    console.log(`\n\n✅ Agent completed with: ${promptResult.stopReason}`);
  } catch (error) {
    console.error("[Client] Error:", error);
  } finally {
    agentProcess.kill();
    process.exit(0);
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
