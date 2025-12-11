import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { Finding, Schema } from "../tools.js";
import type { HealthCheckResult } from "../health.js";
import {
  type Reporter,
  type ReportData,
  formatType,
  getToolFindings,
} from "./shared.js";

// Styling constants
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const green = "\x1b[32m";
const purple = "\x1b[35m";
const muted = "\x1b[90m";
const coral = "\x1b[91m";

const CHECK = `${green}✓${RESET}`;
const CROSS = `${coral}✗${RESET}`;
const WARN = `${muted}~${RESET}`;

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
  const schema = tool.inputSchema as Schema | undefined;
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const propNames = Object.keys(properties);

  const requiredCount = propNames.filter((n) => required.has(n)).length;
  const optionalCount = propNames.length - requiredCount;

  const toolFindings = getToolFindings(findings, tool.name);
  const hasToolDescWarning = toolFindings.some(
    (f) => f.message === "Missing tool description" && !f.inputName,
  );

  // Tool name header
  lines.push(`\n  ${BOLD}${purple}◆ ${tool.name}${RESET}`);

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

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");

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
  const lines: string[] = [];
  const total = tools.length;
  const toolDescFindings = findings.filter(
    (f) => f.message === "Missing tool description",
  );
  const inputDescFindings = findings.filter(
    (f) => f.message === "Missing input description",
  );

  // Count total inputs
  let totalInputs = 0;
  for (const tool of tools) {
    const schema = tool.inputSchema as Schema | undefined;
    const props = schema?.properties ?? {};
    totalInputs += Object.keys(props).length;
  }

  lines.push(`\n${DIM}${"─".repeat(60)}${RESET}`);
  lines.push(`${BOLD}Summary${RESET}`);
  lines.push(`  Tools: ${total}`);

  // Tool descriptions
  if (toolDescFindings.length > 0) {
    lines.push(
      `  ${CROSS} ${toolDescFindings.length}/${total} tools missing description`,
    );
  } else {
    lines.push(`  ${CHECK} All tools have descriptions`);
  }

  // Input documentation
  if (totalInputs > 0) {
    if (inputDescFindings.length > 0) {
      lines.push(
        `  ${WARN} ${inputDescFindings.length}/${totalInputs} inputs missing description`,
      );
    } else {
      lines.push(`  ${CHECK} All inputs documented`);
    }
  }

  return lines.join("\n");
}

function formatResults(tools: Tool[], findings: Finding[]): string {
  if (tools.length === 0) {
    return "\nNo tools available";
  }

  const lines: string[] = [];
  lines.push(`\n${BOLD}Tools (${tools.length})${RESET}`);
  for (const tool of tools) {
    lines.push(formatTool(tool, findings));
  }
  lines.push(formatFindings(findings));
  lines.push(formatSummary(tools, findings));
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
  lines.push(`Tools response time: ${data.toolsResponseTimeMs.toFixed(2)}ms`);

  // Health
  if (data.health) {
    lines.push(formatHealth(data.health));
  }

  // Results
  lines.push(formatResults(data.tools, data.findings));

  return lines.join("\n");
};
