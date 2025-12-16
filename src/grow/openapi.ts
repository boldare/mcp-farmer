import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

export interface ResponseField {
  name: string;
  type: string;
  description?: string;
  required: boolean;
}

export interface ResponseSchema {
  statusCode: string;
  description?: string;
  fields: ResponseField[];
}

export interface OpenAPIOperation {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: unknown[];
  requestBody?: unknown;
  responses?: ResponseSchema[];
}

interface OpenAPISchemaObject {
  type?: string;
  properties?: Record<
    string,
    {
      type?: string;
      description?: string;
      $ref?: string;
      items?: { type?: string; $ref?: string };
    }
  >;
  required?: string[];
  $ref?: string;
  items?: { type?: string; $ref?: string };
}

interface OpenAPIResponseObject {
  description?: string;
  content?: Record<
    string,
    {
      schema?: OpenAPISchemaObject;
    }
  >;
  schema?: OpenAPISchemaObject; // Swagger 2.0
}

export interface OpenAPISpec {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  paths?: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        summary?: string;
        description?: string;
        parameters?: unknown[];
        requestBody?: unknown;
        responses?: Record<string, OpenAPIResponseObject>;
      }
    >
  >;
  definitions?: Record<string, OpenAPISchemaObject>; // Swagger 2.0
  components?: {
    schemas?: Record<string, OpenAPISchemaObject>;
  };
}

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const;

const SUCCESS_STATUS_CODES = ["200", "201", "202", "204"];

function resolveRef(
  ref: string,
  spec: OpenAPISpec,
): OpenAPISchemaObject | undefined {
  // Handle refs like "#/definitions/Pet" (Swagger 2.0) or "#/components/schemas/Pet" (OpenAPI 3.x)
  const parts = ref.replace(/^#\//, "").split("/");

  if (parts[0] === "definitions" && parts[1]) {
    return spec.definitions?.[parts[1]];
  }
  if (parts[0] === "components" && parts[1] === "schemas" && parts[2]) {
    return spec.components?.schemas?.[parts[2]];
  }
  return undefined;
}

function extractFieldsFromSchema(
  schema: OpenAPISchemaObject | undefined,
  spec: OpenAPISpec,
): ResponseField[] {
  if (!schema) return [];

  // Resolve $ref if present
  if (schema.$ref) {
    const resolved = resolveRef(schema.$ref, spec);
    return extractFieldsFromSchema(resolved, spec);
  }

  // Handle array types - extract fields from items
  if (schema.type === "array" && schema.items) {
    if (schema.items.$ref) {
      const resolved = resolveRef(schema.items.$ref, spec);
      return extractFieldsFromSchema(resolved, spec);
    }
    return [];
  }

  // Extract properties from object schemas
  if (!schema.properties) return [];

  const requiredFields = new Set(schema.required || []);
  const fields: ResponseField[] = [];

  for (const [name, prop] of Object.entries(schema.properties)) {
    let type = prop.type || "unknown";
    if (prop.$ref) {
      type = "object";
    }
    if (prop.items) {
      type = `array<${prop.items.type || "object"}>`;
    }

    fields.push({
      name,
      type,
      description: prop.description,
      required: requiredFields.has(name),
    });
  }

  return fields;
}

function extractResponseSchemas(
  responses: Record<string, OpenAPIResponseObject> | undefined,
  spec: OpenAPISpec,
): ResponseSchema[] {
  if (!responses) return [];

  const schemas: ResponseSchema[] = [];

  for (const statusCode of SUCCESS_STATUS_CODES) {
    const response = responses[statusCode];
    if (!response) continue;

    let schema: OpenAPISchemaObject | undefined;

    // OpenAPI 3.x: response.content["application/json"].schema
    if (response.content) {
      const jsonContent =
        response.content["application/json"] || response.content["*/*"];
      schema = jsonContent?.schema;
    }
    // Swagger 2.0: response.schema directly
    else if (response.schema) {
      schema = response.schema;
    }

    const fields = extractFieldsFromSchema(schema, spec);

    if (fields.length > 0) {
      schemas.push({
        statusCode,
        description: response.description,
        fields,
      });
    }
  }

  return schemas;
}

function isUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

export async function fetchOpenApiSpec(
  pathOrUrl: string,
): Promise<OpenAPISpec> {
  let content: string;

  if (isUrl(pathOrUrl)) {
    const response = await fetch(pathOrUrl, {
      headers: { Accept: "application/json, application/yaml, text/yaml" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch: ${response.status} ${response.statusText}`,
      );
    }
    content = await response.text();
  } else {
    content = await readFile(pathOrUrl, "utf-8");
  }

  try {
    return JSON.parse(content) as OpenAPISpec;
  } catch {
    // Try YAML
  }

  try {
    return parseYaml(content) as OpenAPISpec;
  } catch {
    throw new Error("Failed to parse document as JSON or YAML");
  }
}

export function extractEndpoints(spec: OpenAPISpec): OpenAPIOperation[] {
  const endpoints: OpenAPIOperation[] = [];

  if (!spec.paths) {
    return endpoints;
  }

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation) {
        const responses = extractResponseSchemas(operation.responses, spec);

        endpoints.push({
          method: method.toUpperCase(),
          path,
          operationId: operation.operationId,
          summary: operation.summary,
          description: operation.description,
          parameters: operation.parameters,
          requestBody: operation.requestBody,
          responses: responses.length > 0 ? responses : undefined,
        });
      }
    }
  }

  return endpoints;
}
