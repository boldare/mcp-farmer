import type {
  Prompt,
  Resource,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

import type { Finding } from "../tools.js";
import type { HealthCheckResult } from "../health.js";
import { extractToolSchema } from "../../shared/schema.js";

interface ToolStats {
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

interface GroupedFindings {
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

export function getToolFindings(
  findings: Finding[],
  toolName: string,
): Finding[] {
  return findings.filter((f) => f.toolName === toolName);
}
