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
} from "./shared.js";
import {
  type Schema,
  extractToolSchema,
  formatType,
} from "../../shared/schema.js";

function escapeMd(str: string): string {
  return str.replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\r/g, "");
}

function renderAnnotationBadges(
  annotations: ToolAnnotations | undefined,
): string {
  if (!annotations) return "";

  const badges: string[] = [];

  if (annotations.readOnlyHint) badges.push("`read-only`");
  if (annotations.destructiveHint) badges.push("`destructive`");
  if (annotations.idempotentHint) badges.push("`idempotent`");
  if (annotations.openWorldHint) badges.push("`open-world`");

  return badges.length > 0 ? ` ${badges.join(" ")}` : "";
}

function renderTool(tool: Tool, findings: Finding[]): string {
  const { properties, required, propNames } = extractToolSchema(tool);
  const toolFindings = getToolFindings(findings, tool.name);

  const badgesStr = renderAnnotationBadges(tool.annotations);

  const nameStr = tool.annotations?.title
    ? `\`${tool.annotations.title}\` (${tool.name})`
    : `\`${tool.name}\``;

  const lines: string[] = [];
  lines.push(`### ${nameStr}${badgesStr}`);
  lines.push("");

  lines.push(
    tool.description ? escapeMd(tool.description) : "*No description*",
  );
  lines.push("");

  if (propNames.length === 0) {
    lines.push("**Inputs:** None");
  } else {
    lines.push("**Inputs:**");
    lines.push("");
    lines.push("| Name | Type | Description |");
    lines.push("|------|------|-------------|");

    for (const name of propNames) {
      const prop = properties[name];
      if (!prop) continue;
      const isRequired = required.has(name);
      const type = formatType(prop);
      const desc = prop.description ? escapeMd(prop.description) : "—";
      const reqMark = isRequired ? "*" : "";
      lines.push(`| \`${name}\`${reqMark} | ${type} | ${desc} |`);
    }
  }
  lines.push("");

  const outputSchema = (tool as Tool & { outputSchema?: Schema }).outputSchema;
  if (outputSchema) {
    const outputProps = outputSchema.properties ?? {};
    const outputPropNames = Object.keys(outputProps);

    if (outputPropNames.length === 0) {
      lines.push("**Output:** No fields");
    } else {
      lines.push("**Output:**");
      lines.push("");
      lines.push("| Name | Type | Description |");
      lines.push("|------|------|-------------|");

      for (const name of outputPropNames) {
        const prop = outputProps[name];
        if (!prop) continue;
        const type = formatType(prop);
        const desc = prop.description ? escapeMd(prop.description) : "—";
        lines.push(`| \`${name}\` | ${type} | ${desc} |`);
      }
    }
    lines.push("");
  }

  if (toolFindings.length > 0) {
    lines.push("**Issues:**");
    lines.push("");
    for (const f of toolFindings) {
      const icon =
        f.severity === "error" ? "[x]" : f.severity === "warning" ? "[!]" : "[i]";
      const inputPart = f.inputName ? `: \`${f.inputName}\`` : "";
      lines.push(`- ${icon} ${f.message}${inputPart}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderSummary(
  tools: Tool[],
  resourcesSupported: boolean,
  promptsSupported: boolean,
  resources: Resource[] | null,
  prompts: Prompt[] | null,
  findings: Finding[],
  health: HealthCheckResult | null,
): string {
  const stats = computeStats(tools, findings);

  const issues: string[] = [];
  if (stats.toolDescMissing > 0)
    issues.push(`${stats.toolDescMissing} tool desc missing`);
  if (stats.inputDescMissing > 0)
    issues.push(`${stats.inputDescMissing} input desc missing`);

  const resourcesCount = !resourcesSupported
    ? "Not supported"
    : resources === null
      ? "Unavailable"
      : String(resources.length);
  const promptsCount = !promptsSupported
    ? "Not supported"
    : prompts === null
      ? "Unavailable"
      : String(prompts.length);

  const healthStatus = health
    ? health.available
      ? `${health.status} OK`
      : "unavailable"
    : null;

  const lines: string[] = [];
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Tools | ${stats.totalTools} |`);
  lines.push(`| Prompts | ${promptsCount} |`);
  lines.push(`| Resources | ${resourcesCount} |`);
  lines.push(`| Inputs | ${stats.totalInputs} |`);
  if (healthStatus) lines.push(`| /health | ${healthStatus} |`);
  if (issues.length > 0) lines.push(`| Issues | ${issues.join(", ")} |`);

  return lines.join("\n");
}

function renderResources(
  resources: Resource[] | null,
  supported: boolean,
): string {
  if (!supported) return "*Not supported by server*";
  if (resources === null) return "*Unavailable*";
  if (resources.length === 0) return "*No resources exposed*";

  const lines: string[] = [];
  lines.push("| Name | URI | Description |");
  lines.push("|------|-----|-------------|");

  for (const r of resources) {
    const desc = r.description ? escapeMd(r.description) : "—";
    lines.push(
      `| \`${escapeMd(r.name)}\` | \`${escapeMd(r.uri)}\` | ${desc} |`,
    );
  }

  return lines.join("\n");
}

function renderPrompts(prompts: Prompt[] | null, supported: boolean): string {
  if (!supported) return "*Not supported by server*";
  if (prompts === null) return "*Unavailable*";
  if (prompts.length === 0) return "*No prompts exposed*";

  const lines: string[] = [];
  lines.push("| Name | Arguments | Description |");
  lines.push("|------|-----------|-------------|");

  for (const p of prompts) {
    const args =
      p.arguments && p.arguments.length > 0
        ? p.arguments.map((a) => `${a.required ? "*" : ""}${a.name}`).join(", ")
        : "—";
    const desc = p.description ? escapeMd(p.description) : "—";
    lines.push(`| \`${escapeMd(p.name)}\` | ${args} | ${desc} |`);
  }

  return lines.join("\n");
}

export const markdownReporter: Reporter = (data: ReportData): string => {
  if (data.authError) {
    const authHeaderLine = data.authError.authHeader
      ? `\n**Auth Header:** \`${data.authError.authHeader}\`\n`
      : "";
    return `# Authentication Required

**Error:** ${data.authError.message}
${authHeaderLine}`;
  }

  const {
    serverName,
    serverVersion,
    target,
    tools,
    resourcesSupported,
    promptsSupported,
    resources,
    prompts,
    findings,
    health,
    toolsResponseTimeMs,
    resourcesResponseTimeMs,
    promptsResponseTimeMs,
  } = data;

  const title =
    serverName && serverVersion ? `${serverName} v${serverVersion}` : target;

  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> ${target}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(
    renderSummary(
      tools,
      resourcesSupported,
      promptsSupported,
      resources,
      prompts,
      findings,
      health,
    ),
  );
  lines.push("");

  const toolsTiming =
    toolsResponseTimeMs !== null
      ? ` (${toolsResponseTimeMs.toFixed(0)}ms)`
      : "";
  lines.push(`## Tools${toolsTiming}`);
  lines.push("");

  if (tools.length === 0) {
    lines.push("*No tools exposed*");
  } else {
    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      if (!tool) continue;
      lines.push(renderTool(tool, findings));
      if (i < tools.length - 1) {
        lines.push("---");
        lines.push("");
      }
    }
  }

  if (promptsSupported && prompts !== null && prompts.length > 0) {
    const promptsTiming =
      promptsResponseTimeMs !== null
        ? ` (${promptsResponseTimeMs.toFixed(0)}ms)`
        : "";
    lines.push(`## Prompts${promptsTiming}`);
    lines.push("");
    lines.push(renderPrompts(prompts, promptsSupported));
    lines.push("");
  }

  if (resourcesSupported && resources !== null && resources.length > 0) {
    const resourcesTiming =
      resourcesResponseTimeMs !== null
        ? ` (${resourcesResponseTimeMs.toFixed(0)}ms)`
        : "";
    lines.push(`## Resources${resourcesTiming}`);
    lines.push("");
    lines.push(renderResources(resources, resourcesSupported));
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    `*Generated by [mcp-farmer](https://github.com/boldare/mcp-farmer) · ${new Date().toISOString().split("T")[0]}*`,
  );

  return lines.join("\n") + "\n";
};
