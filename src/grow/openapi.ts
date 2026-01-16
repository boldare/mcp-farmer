import SwaggerParser from "@apidevtools/swagger-parser";

interface ResponseField {
  name: string;
  type: string;
  description?: string;
  required: boolean;
}

export interface ParameterInfo {
  name: string;
  type: string;
  location: string;
  required: boolean;
  description?: string;
}

interface OpenAPIParameter {
  name?: string;
  in?: string;
  required?: boolean;
  type?: string;
  description?: string;
  schema?: { type?: string };
}

function isOpenAPIParameter(param: unknown): param is OpenAPIParameter {
  return typeof param === "object" && param !== null && "name" in param;
}

export function extractParameters(
  parameters: unknown[] | undefined,
): ParameterInfo[] {
  if (!parameters) return [];

  return parameters
    .filter(isOpenAPIParameter)
    .filter((p) => p.name && p.in !== "header") // Skip headers, they're rarely user-facing
    .map((p) => ({
      name: p.name!,
      type: p.type || p.schema?.type || "unknown",
      location: p.in || "unknown",
      required: p.required ?? false,
      description: p.description,
    }));
}

export function formatParametersSummary(
  parameters: unknown[] | undefined,
): string {
  const params = extractParameters(parameters);
  if (params.length === 0) return "";

  return params
    .map((p) => {
      const optional = p.required ? "" : "?";
      return `${p.name}${optional}: ${p.type}`;
    })
    .join(", ");
}

interface ResponseSchema {
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

interface SchemaObject {
  type?: string | string[];
  properties?: Record<string, unknown>;
  required?: string[];
  items?: unknown;
  description?: string;
}

function isSchemaObject(schema: unknown): schema is SchemaObject {
  return typeof schema === "object" && schema !== null && !("$ref" in schema);
}

function extractFieldsFromSchema(
  schema: SchemaObject | undefined,
): ResponseField[] {
  if (!schema) return [];

  // Handle array types - extract fields from items
  if (schema.type === "array" && schema.items) {
    if (isSchemaObject(schema.items)) {
      return extractFieldsFromSchema(schema.items);
    }
    return [];
  }

  // Extract properties from object schemas
  if (!schema.properties) return [];

  const requiredFields = new Set(schema.required ?? []);
  const fields: ResponseField[] = [];

  for (const [name, prop] of Object.entries(schema.properties)) {
    if (!isSchemaObject(prop)) continue;

    let type = "unknown";
    if (prop.type) {
      type = Array.isArray(prop.type) ? prop.type.join(" | ") : prop.type;
    }
    if (prop.items) {
      const itemType = isSchemaObject(prop.items) ? prop.items.type : undefined;
      type = `array<${itemType || "object"}>`;
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

interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: unknown }>;
  schema?: unknown; // Swagger 2.0
}

function isResponseObject(obj: unknown): obj is ResponseObject {
  return typeof obj === "object" && obj !== null;
}

function extractResponseSchemas(
  responses: Record<string, unknown> | undefined,
): ResponseSchema[] {
  if (!responses) return [];

  const schemas: ResponseSchema[] = [];

  for (const statusCode of SUCCESS_STATUS_CODES) {
    const response = responses[statusCode];
    if (!isResponseObject(response)) {
      continue;
    }

    let schema: SchemaObject | undefined;

    // OpenAPI 3.x: response.content["application/json"].schema
    if (response.content) {
      const jsonContent =
        response.content["application/json"] || response.content["*/*"];
      if (jsonContent?.schema && isSchemaObject(jsonContent.schema)) {
        schema = jsonContent.schema;
      }
    }
    // Swagger 2.0: response.schema directly
    else if (response.schema && isSchemaObject(response.schema)) {
      schema = response.schema;
    }

    const fields = extractFieldsFromSchema(schema);

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

interface ParsedOpenApiSpec {
  version: string;
  title: string;
  endpoints: OpenAPIOperation[];
}

type ParseResult =
  | { ok: true; value: ParsedOpenApiSpec }
  | { ok: false; error: string };

export async function parseOpenApiSpec(
  pathOrUrl: string,
): Promise<ParseResult> {
  let spec: Awaited<ReturnType<typeof SwaggerParser.validate>>;
  try {
    spec = await SwaggerParser.validate(pathOrUrl);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let version: string | undefined;
  if ("openapi" in spec) {
    version = spec.openapi;
  } else if ("swagger" in spec) {
    version = spec.swagger;
  }

  if (!version) {
    return {
      ok: false,
      error: "Invalid OpenAPI document: missing 'openapi' or 'swagger' field",
    };
  }

  if (!spec.paths) {
    return {
      ok: false,
      error: "Invalid OpenAPI document: missing 'paths' field",
    };
  }

  const endpoints: OpenAPIOperation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem) {
      continue;
    }

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation || typeof operation !== "object") {
        continue;
      }

      const responses = extractResponseSchemas(operation.responses);

      endpoints.push({
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        parameters: operation.parameters as unknown[],
        requestBody:
          "requestBody" in operation ? operation.requestBody : undefined,
        responses: responses.length > 0 ? responses : undefined,
      });
    }
  }

  return {
    ok: true,
    value: {
      version,
      title: spec.info?.title || "Unknown API",
      endpoints,
    },
  };
}
