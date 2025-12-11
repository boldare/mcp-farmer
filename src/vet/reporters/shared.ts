import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { Finding, SchemaProperty } from "../tools.js";
import type { HealthCheckResult } from "../health.js";

export interface ReportData {
  serverName?: string;
  serverVersion?: string;
  url: string;
  tools: Tool[];
  findings: Finding[];
  health: HealthCheckResult | null;
  toolsResponseTimeMs: number;
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
