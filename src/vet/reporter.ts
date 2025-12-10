import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { Finding, Schema, SchemaProperty } from "./tools.js";
import type { HealthCheckResult } from "./health.js";
import type { AuthenticationRequiredError } from "./mcp.js";

// Styling constants
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const green = Bun.color("green", "ansi");
const purple = Bun.color("#7563e7", "ansi");
const muted = Bun.color("#a9b8d8", "ansi");
const coral = Bun.color("#f57474", "ansi");

const CHECK = `${green}✓${RESET}`;
const CROSS = `${coral}✗${RESET}`;
const WARN = `${muted}~${RESET}`;

function formatType(prop: SchemaProperty): string {
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

function getToolFindings(findings: Finding[], toolName: string): Finding[] {
  return findings.filter((f) => f.toolName === toolName);
}

function printTool(tool: Tool, findings: Finding[]) {
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
  console.log(`\n  ${BOLD}${purple}◆ ${tool.name}${RESET}`);

  // Description
  if (tool.description) {
    const lines = wrapText(tool.description, 80);
    lines.forEach((line) => console.log(`    ${DIM}${line}${RESET}`));
  } else {
    console.log(`    ${coral}⚠ No description provided${RESET}`);
  }

  console.log(); // spacing

  // Inputs section
  if (propNames.length === 0) {
    console.log(`    Inputs: ${DIM}none${RESET}`);
  } else {
    const inputSummary = `${requiredCount} required${
      optionalCount > 0 ? `, ${optionalCount} optional` : ""
    }`;
    console.log(`    Inputs ${DIM}(${inputSummary})${RESET}`);

    propNames.forEach((name) => {
      const prop = properties[name]!;
      const isRequired = required.has(name);
      const reqLabel = isRequired ? `${purple}*${RESET}` : " ";

      const type = formatType(prop);
      console.log(
        `      ${reqLabel} ${BOLD}${name}${RESET} ${DIM}(${type})${RESET}`,
      );

      if (prop.description) {
        const desc = truncate(prop.description, 65);
        console.log(`          ${DIM}${desc}${RESET}`);
      } else {
        console.log(`          ${muted}⚠ no description${RESET}`);
      }
    });
  }

  // Quality summary line from findings
  const inputFindingsCount = toolFindings.filter((f) => f.inputName).length;
  const issues: string[] = [];
  if (hasToolDescWarning) issues.push("missing tool description");
  if (inputFindingsCount > 0)
    issues.push(`${inputFindingsCount} input(s) undocumented`);

  if (issues.length > 0) {
    console.log(`\n    ${muted}⚠ ${issues.join(", ")}${RESET}`);
  }
}

export function printHealth(health: HealthCheckResult) {
  console.log(`${BOLD}Health Endpoint${RESET}`);
  if (health.available) {
    console.log(`  ${CHECK} Available (status: ${health.status})`);
  } else {
    console.log(
      `  ${CROSS} Not available${health.error ? ` (${health.error})` : ""}`,
    );
  }
}

function printSummary(tools: Tool[], findings: Finding[]) {
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

  console.log(`\n${DIM}${"─".repeat(60)}${RESET}`);
  console.log(`${BOLD}Summary${RESET}`);
  console.log(`  Tools: ${total}`);

  // Tool descriptions
  if (toolDescFindings.length > 0) {
    console.log(
      `  ${CROSS} ${toolDescFindings.length}/${total} tools missing description`,
    );
  } else {
    console.log(`  ${CHECK} All tools have descriptions`);
  }

  // Input documentation
  if (totalInputs > 0) {
    if (inputDescFindings.length > 0) {
      console.log(
        `  ${WARN} ${inputDescFindings.length}/${totalInputs} inputs missing description`,
      );
    } else {
      console.log(`  ${CHECK} All inputs documented`);
    }
  }
}

export function printResults(tools: Tool[], findings: Finding[]) {
  if (tools.length === 0) {
    console.log("\nNo tools available");
  } else {
    console.log(`\n${BOLD}Tools (${tools.length})${RESET}`);
    for (const tool of tools) {
      printTool(tool, findings);
    }
    printSummary(tools, findings);
  }
}

export function printAuthError(error: AuthenticationRequiredError) {
  console.log(`${BOLD}Authentication Required${RESET}\n`);
  console.log(`  ${CROSS} ${error.message}`);

  if (error.authHeader) {
    console.log(`\n  ${DIM}WWW-Authenticate: ${error.authHeader}${RESET}`);
  }

  console.log(`\n${DIM}This MCP server requires authentication.${RESET}`);
  console.log(
    `${DIM}Provide credentials via the server's authentication flow.${RESET}`,
  );
}
