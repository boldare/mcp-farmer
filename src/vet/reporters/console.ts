import type {
  Prompt,
  Resource,
  Tool,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";

import type { Finding } from "../tools.js";
import type { HealthCheckResult } from "../health.js";
import {
  type Reporter,
  type ReportData,
  getToolFindings,
  computeStats,
  groupFindingsBySeverity,
} from "./shared.js";
import {
  type Schema,
  extractToolSchema,
  formatType,
} from "../../shared/schema.js";

// Styling constants
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const green = "\x1b[32m";
const purple = "\x1b[35m";
const muted = "\x1b[90m";
const coral = "\x1b[91m";

const cyan = "\x1b[36m";

const CHECK = `${green}✓${RESET}`;
const CROSS = `${coral}✗${RESET}`;
const WARN = `${muted}~${RESET}`;

function formatAnnotations(annotations: ToolAnnotations | undefined): string {
  if (!annotations) return "";

  const badges: string[] = [];

  if (annotations.readOnlyHint) {
    badges.push(`${cyan}read-only${RESET}`);
  }
  if (annotations.destructiveHint) {
    badges.push(`${coral}destructive${RESET}`);
  }
  if (annotations.idempotentHint) {
    badges.push(`${green}idempotent${RESET}`);
  }
  if (annotations.openWorldHint) {
    badges.push(`${purple}open-world${RESET}`);
  }

  return badges.length > 0
    ? ` ${DIM}[${RESET}${badges.join(`${DIM}, ${RESET}`)}${DIM}]${RESET}`
    : "";
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

function wrapText(str: string, maxLength: number): string[] {
  const words = str.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 <= maxLength) {
      current += (current ? " " : "") + word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines;
}

function formatTool(tool: Tool, findings: Finding[]): string {
  const lines: string[] = [];
  const { properties, required, propNames, requiredCount, optionalCount } =
    extractToolSchema(tool);

  const toolFindings = getToolFindings(findings, tool.name);
  const hasToolDescWarning = toolFindings.some(
    (f) => f.message === "Missing tool description" && !f.inputName,
  );

  const annotationsBadges = formatAnnotations(tool.annotations);

  // Tool name header with annotations
  const displayName = tool.annotations?.title ?? tool.name;
  const nameDisplay = tool.annotations?.title
    ? `${displayName} ${DIM}(${tool.name})${RESET}`
    : tool.name;
  lines.push(
    `\n  ${BOLD}${purple}◆ ${nameDisplay}${RESET}${annotationsBadges}`,
  );

  // Description
  if (tool.description) {
    const descLines = wrapText(tool.description, 80);
    descLines.forEach((line) => lines.push(`    ${DIM}${line}${RESET}`));
  } else {
    lines.push(`    ${coral}⚠ No description provided${RESET}`);
  }

  lines.push(""); // spacing

  // Inputs section
  if (propNames.length === 0) {
    lines.push(`    Inputs: ${DIM}none${RESET}`);
  } else {
    const inputSummary = `${requiredCount} required${
      optionalCount > 0 ? `, ${optionalCount} optional` : ""
    }`;
    lines.push(`    Inputs ${DIM}(${inputSummary})${RESET}`);

    propNames.forEach((name) => {
      const prop = properties[name];
      if (!prop) {
        return;
      }
      const isRequired = required.has(name);
      const reqLabel = isRequired ? `${purple}*${RESET}` : " ";

      const type = formatType(prop);
      lines.push(
        `      ${reqLabel} ${BOLD}${name}${RESET} ${DIM}(${type})${RESET}`,
      );

      if (prop.description) {
        const desc = truncate(prop.description, 65);
        lines.push(`          ${DIM}${desc}${RESET}`);
      } else {
        lines.push(`          ${muted}⚠ no description${RESET}`);
      }
    });
  }

  // Output section
  const outputSchema = (tool as Tool & { outputSchema?: Schema }).outputSchema;
  if (outputSchema) {
    const outputProps = outputSchema.properties ?? {};
    const outputPropNames = Object.keys(outputProps);

    lines.push(""); // spacing
    if (outputPropNames.length === 0) {
      lines.push(`    Output: ${DIM}none${RESET}`);
    } else {
      lines.push(`    Output ${DIM}(${outputPropNames.length} fields)${RESET}`);
      outputPropNames.forEach((name) => {
        const prop = outputProps[name];
        if (!prop) return;
        const type = formatType(prop);
        lines.push(`        ${BOLD}${name}${RESET} ${DIM}(${type})${RESET}`);
        if (prop.description) {
          const desc = truncate(prop.description, 65);
          lines.push(`          ${DIM}${desc}${RESET}`);
        }
      });
    }
  }

  // Quality summary line from findings
  const inputFindingsCount = toolFindings.filter((f) => f.inputName).length;
  const issues: string[] = [];
  if (hasToolDescWarning) issues.push("missing tool description");
  if (inputFindingsCount > 0)
    issues.push(`${inputFindingsCount} input(s) undocumented`);

  if (issues.length > 0) {
    lines.push(`\n    ${muted}⚠ ${issues.join(", ")}${RESET}`);
  }

  return lines.join("\n");
}

function formatHealth(health: HealthCheckResult): string {
  const lines: string[] = [];
  lines.push(`${BOLD}Health Endpoint${RESET}`);
  if (health.available) {
    lines.push(`  ${CHECK} Available (status: ${health.status})`);
  } else {
    lines.push(
      `  ${CROSS} Not available${health.error ? ` (${health.error})` : ""}`,
    );
  }
  return lines.join("\n");
}

function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`\n${DIM}${"─".repeat(60)}${RESET}`);
  lines.push(`${BOLD}Findings${RESET}\n`);

  const { errors, warnings, infos } = groupFindingsBySeverity(findings);

  if (errors.length > 0) {
    lines.push(`${BOLD}Errors (${errors.length})${RESET}`);
    for (const finding of errors) {
      const location = finding.toolName
        ? finding.inputName
          ? `${finding.toolName}.${finding.inputName}`
          : finding.toolName
        : "server";
      lines.push(`  ${CROSS} ${finding.message} ${DIM}(${location})${RESET}`);
    }
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push(`${BOLD}Warnings (${warnings.length})${RESET}`);
    for (const finding of warnings) {
      const location = finding.toolName
        ? finding.inputName
          ? `${finding.toolName}.${finding.inputName}`
          : finding.toolName
        : "server";
      lines.push(`  ${WARN} ${finding.message} ${DIM}(${location})${RESET}`);
    }
    lines.push("");
  }

  if (infos.length > 0) {
    lines.push(`${BOLD}Info (${infos.length})${RESET}`);
    for (const finding of infos) {
      const location = finding.toolName
        ? finding.inputName
          ? `${finding.toolName}.${finding.inputName}`
          : finding.toolName
        : "server";
      lines.push(`  ${DIM}ℹ ${finding.message} (${location})${RESET}`);
    }
  }

  return lines.join("\n");
}

function formatSummary(tools: Tool[], findings: Finding[]): string {
  const stats = computeStats(tools, findings);
  const lines: string[] = [];

  lines.push(`\n${DIM}${"─".repeat(60)}${RESET}`);
  lines.push(`${BOLD}Summary${RESET}`);
  lines.push(`  Tools: ${stats.totalTools}`);

  // Tool descriptions
  if (stats.toolDescMissing > 0) {
    lines.push(
      `  ${CROSS} ${stats.toolDescMissing}/${stats.totalTools} tools missing description`,
    );
  } else {
    lines.push(`  ${CHECK} All tools have descriptions`);
  }

  // Input documentation
  if (stats.totalInputs > 0) {
    if (stats.inputDescMissing > 0) {
      lines.push(
        `  ${WARN} ${stats.inputDescMissing}/${stats.totalInputs} inputs missing description`,
      );
    } else {
      lines.push(`  ${CHECK} All inputs documented`);
    }
  }

  return lines.join("\n");
}

function formatResults(
  tools: Tool[],
  findings: Finding[],
  responseTimeMs: number,
): string {
  const lines: string[] = [];
  const timingInfo = `${DIM}(${responseTimeMs.toFixed(2)}ms)${RESET}`;

  if (tools.length === 0) {
    lines.push(`\n${BOLD}Tools (0)${RESET} ${timingInfo}`);
    lines.push(`  ${DIM}none${RESET}`);
  } else {
    lines.push(`\n${BOLD}Tools (${tools.length})${RESET} ${timingInfo}`);
    for (const tool of tools) {
      lines.push(formatTool(tool, findings));
    }
    lines.push(formatFindings(findings));
    lines.push(formatSummary(tools, findings));
  }
  return lines.join("\n");
}

function formatAuthError(authError: {
  message: string;
  authHeader?: string;
}): string {
  const lines: string[] = [];
  lines.push(`${BOLD}Authentication Required${RESET}\n`);
  lines.push(`  ${CROSS} ${authError.message}`);

  if (authError.authHeader) {
    lines.push(`\n  ${DIM}WWW-Authenticate: ${authError.authHeader}${RESET}`);
  }

  lines.push(`\n${DIM}This MCP server requires authentication.${RESET}`);
  lines.push(
    `${DIM}Use --oauth flag to enable OAuth authentication flow.${RESET}`,
  );
  return lines.join("\n");
}

export const consoleReporter: Reporter = (data: ReportData): string => {
  // Handle auth error case
  if (data.authError) {
    return formatAuthError(data.authError);
  }

  const lines: string[] = [];

  // Server info
  if (data.serverName && data.serverVersion) {
    lines.push(`Server: ${data.serverName} v${data.serverVersion}`);
  }

  // Health
  if (data.health) {
    lines.push(formatHealth(data.health));
  }

  // Tools (with timing)
  lines.push(
    formatResults(data.tools, data.findings, data.toolsResponseTimeMs),
  );

  // Prompts (with timing)
  lines.push(
    formatPrompts(
      data.prompts,
      data.promptsSupported,
      data.promptsResponseTimeMs,
    ),
  );

  // Resources (with timing)
  lines.push(
    formatResources(
      data.resources,
      data.resourcesSupported,
      data.resourcesResponseTimeMs,
    ),
  );

  return lines.join("\n");
};

function formatResources(
  resources: Resource[] | null,
  supported: boolean,
  responseTimeMs: number | null,
): string {
  const timingInfo =
    responseTimeMs !== null
      ? ` ${DIM}(${responseTimeMs.toFixed(2)}ms)${RESET}`
      : "";

  if (!supported) {
    return `\n${BOLD}Resources${RESET}\n  ${DIM}Not supported by server${RESET}`;
  }
  if (resources === null) {
    return `\n${BOLD}Resources${RESET}\n  ${DIM}Unavailable${RESET}`;
  }
  if (resources.length === 0) {
    return `\n${BOLD}Resources (0)${RESET}${timingInfo}\n  ${DIM}none${RESET}`;
  }

  const lines: string[] = [];
  lines.push(`\n${BOLD}Resources (${resources.length})${RESET}${timingInfo}`);
  for (const r of resources) {
    lines.push(`  ${BOLD}${r.name}${RESET} ${DIM}(${r.uri})${RESET}`);
    if (r.description) {
      lines.push(`    ${DIM}${truncate(r.description, 90)}${RESET}`);
    }
  }
  return lines.join("\n");
}

function formatPrompts(
  prompts: Prompt[] | null,
  supported: boolean,
  responseTimeMs: number | null,
): string {
  const timingInfo =
    responseTimeMs !== null
      ? ` ${DIM}(${responseTimeMs.toFixed(2)}ms)${RESET}`
      : "";

  if (!supported) {
    return `\n${BOLD}Prompts${RESET}\n  ${DIM}Not supported by server${RESET}`;
  }
  if (prompts === null) {
    return `\n${BOLD}Prompts${RESET}\n  ${DIM}Unavailable${RESET}`;
  }
  if (prompts.length === 0) {
    return `\n${BOLD}Prompts (0)${RESET}${timingInfo}\n  ${DIM}none${RESET}`;
  }

  const lines: string[] = [];
  lines.push(`\n${BOLD}Prompts (${prompts.length})${RESET}${timingInfo}`);
  for (const p of prompts) {
    lines.push(`  ${BOLD}${p.name}${RESET}`);
    if (p.description) {
      lines.push(`    ${DIM}${truncate(p.description, 90)}${RESET}`);
    }
    if (p.arguments && p.arguments.length > 0) {
      const args = p.arguments
        .map((a) => `${a.required ? "*" : ""}${a.name}`)
        .join(", ");
      lines.push(`    ${DIM}Args: ${args}${RESET}`);
    }
  }
  return lines.join("\n");
}
