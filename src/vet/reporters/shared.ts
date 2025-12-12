import type {
  Prompt,
  Resource,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import type { Finding, Schema, SchemaProperty } from "../tools.js";
import type { HealthCheckResult } from "../health.js";

export interface ExtractedSchema {
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

export interface ToolStats {
  totalTools: number;
  totalInputs: number;
  toolDescMissing: number;
  inputDescMissing: number;
}

export function computeStats(tools: Tool[], findings: Finding[]): ToolStats {
  const toolDescMissing = findings.filter(
    (f) => f.message === "Missing tool description",
  ).length;
  const inputDescMissing = findings.filter(
    (f) => f.message === "Missing input description",
  ).length;
  let totalInputs = 0;
  for (const tool of tools) {
    totalInputs += extractToolSchema(tool).propNames.length;
  }
  return {
    totalTools: tools.length,
    totalInputs,
    toolDescMissing,
    inputDescMissing,
  };
}

export interface GroupedFindings {
  errors: Finding[];
  warnings: Finding[];
  infos: Finding[];
}

export function groupFindingsBySeverity(findings: Finding[]): GroupedFindings {
  return {
    errors: findings.filter((f) => f.severity === "error"),
    warnings: findings.filter((f) => f.severity === "warning"),
    infos: findings.filter((f) => f.severity === "info"),
  };
}

export interface ReportData {
  serverName?: string;
  serverVersion?: string;
  target: string;
  tools: Tool[];
  resourcesSupported: boolean;
  promptsSupported: boolean;
  /**
   * Null means the server/client could not list resources (e.g. capability missing or request failed).
   */
  resources: Resource[] | null;
  /**
   * Null means the server/client could not list prompts (e.g. capability missing or request failed).
   */
  prompts: Prompt[] | null;
  findings: Finding[];
  health: HealthCheckResult | null;
  toolsResponseTimeMs: number;
  resourcesResponseTimeMs: number | null;
  promptsResponseTimeMs: number | null;
  authError?: { message: string; authHeader?: string };
}

export type Reporter = (data: ReportData) => string;

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

export function getToolFindings(
  findings: Finding[],
  toolName: string,
): Finding[] {
  return findings.filter((f) => f.toolName === toolName);
}
