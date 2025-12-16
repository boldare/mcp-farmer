import * as p from "@clack/prompts";

import {
  fetchOpenApiSpec,
  extractEndpoints,
  getSpecVersion,
  type OpenAPIOperation,
  type OpenAPISpec,
  type ResponseField,
} from "./openapi.js";

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

  const selectedEndpoints = (selectedIndices as number[])
    .map((i) => endpoints[i])
    .filter((ep): ep is OpenAPIOperation => ep !== undefined);

  const endpointsWithMapping: EndpointWithFieldMapping[] = [];

  // Ask about response field mapping for each endpoint with responses
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

  console.log(endpointsWithMapping);

  p.outro("Done");
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
