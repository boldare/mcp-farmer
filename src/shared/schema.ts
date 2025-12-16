import type { Tool } from "@modelcontextprotocol/sdk/types.js";

interface SchemaProperty {
  type?: string | string[];
  description?: string;
  anyOf?: { type: string; items?: { type: string } }[];
  items?: { type: string };
  additionalProperties?: { type: string };
}

export interface Schema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

interface ExtractedSchema {
  properties: Record<string, SchemaProperty>;
  required: Set<string>;
  propNames: string[];
  requiredCount: number;
  optionalCount: number;
}

export function extractToolSchema(tool: Tool): ExtractedSchema {
  const schema = tool.inputSchema as Schema | undefined;
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const propNames = Object.keys(properties);
  const requiredCount = propNames.filter((n) => required.has(n)).length;
  return {
    properties,
    required,
    propNames,
    requiredCount,
    optionalCount: propNames.length - requiredCount,
  };
}

export function formatType(prop: SchemaProperty): string {
  if (prop.anyOf) {
    return prop.anyOf
      .map((t) => {
        if (t.type === "array" && t.items) {
          return `${t.items.type}[]`;
        }
        return t.type;
      })
      .join(" | ");
  }
  if (prop.type === "array" && prop.items) {
    return `${prop.items.type}[]`;
  }
  if (prop.type === "object" && prop.additionalProperties) {
    return `Record<string, ${prop.additionalProperties.type}>`;
  }
  if (Array.isArray(prop.type)) {
    return prop.type.join(" | ");
  }
  return prop.type ?? "unknown";
}

export function getPropertyType(prop: SchemaProperty): string {
  if (Array.isArray(prop.type)) {
    return prop.type[0] ?? "string";
  }
  return prop.type ?? "string";
}
