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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAnnotationBadges(
  annotations: ToolAnnotations | undefined,
): string {
  if (!annotations) return "";

  const badges: string[] = [];

  if (annotations.readOnlyHint) {
    badges.push('<span class="badge badge-readonly">read-only</span>');
  }
  if (annotations.destructiveHint) {
    badges.push('<span class="badge badge-destructive">destructive</span>');
  }
  if (annotations.idempotentHint) {
    badges.push('<span class="badge badge-idempotent">idempotent</span>');
  }
  if (annotations.openWorldHint) {
    badges.push('<span class="badge badge-openworld">open-world</span>');
  }

  return badges.length > 0
    ? `<span class="badges">${badges.join("")}</span>`
    : "";
}

function renderTool(tool: Tool, findings: Finding[]): string {
  const { properties, required, propNames } = extractToolSchema(tool);
  const toolFindings = getToolFindings(findings, tool.name);
  const hasIssues = toolFindings.length > 0;

  const badgesHtml = renderAnnotationBadges(tool.annotations);

  // Display name (use title if available, otherwise tool.name)
  const displayName = tool.annotations?.title ?? tool.name;
  const nameHtml = tool.annotations?.title
    ? `<code>${escapeHtml(displayName)}</code> <span class="tool-id">(${escapeHtml(tool.name)})</span>`
    : `<code>${escapeHtml(tool.name)}</code>`;

  let inputsHtml = "";
  if (propNames.length === 0) {
    inputsHtml = `<p class="empty">No inputs</p>`;
  } else {
    const rows = propNames
      .map((name) => {
        const prop = properties[name];
        if (!prop) return "";
        const isRequired = required.has(name);
        const type = formatType(prop);
        const desc = prop.description;

        return `<tr${!desc ? ' class="missing-desc"' : ""}>
          <td class="name"><code>${escapeHtml(name)}</code>${isRequired ? "<sup>*</sup>" : ""}</td>
          <td class="type">${escapeHtml(type)}</td>
          <td class="desc">${desc ? escapeHtml(desc) : "—"}</td>
        </tr>`;
      })
      .join("");

    inputsHtml = `<h4 class="section-label">Inputs</h4><table class="inputs"><tbody>${rows}</tbody></table>`;
  }

  // Render output schema if present
  const outputSchema = (tool as Tool & { outputSchema?: Schema }).outputSchema;
  let outputsHtml = "";
  if (outputSchema) {
    const outputProps = outputSchema.properties ?? {};
    const outputPropNames = Object.keys(outputProps);

    if (outputPropNames.length === 0) {
      outputsHtml = `<h4 class="section-label">Output</h4><p class="empty">No output fields</p>`;
    } else {
      const rows = outputPropNames
        .map((name) => {
          const prop = outputProps[name];
          if (!prop) return "";
          const type = formatType(prop);
          const desc = prop.description;

          return `<tr>
            <td class="name"><code>${escapeHtml(name)}</code></td>
            <td class="type">${escapeHtml(type)}</td>
            <td class="desc">${desc ? escapeHtml(desc) : "—"}</td>
          </tr>`;
        })
        .join("");

      outputsHtml = `<h4 class="section-label">Output</h4><table class="inputs"><tbody>${rows}</tbody></table>`;
    }
  }

  const issuesHtml =
    hasIssues && toolFindings.length > 0
      ? `<ul class="issues">${toolFindings
          .map((f) => {
            const icon =
              f.severity === "error"
                ? "✗"
                : f.severity === "warning"
                  ? "⚠"
                  : "ℹ";
            const cls = f.severity === "info" ? ' class="info"' : "";
            return `<li${cls}>${icon} ${escapeHtml(f.message)}${f.inputName ? `: <code>${escapeHtml(f.inputName)}</code>` : ""}</li>`;
          })
          .join("")}</ul>`
      : "";

  return `
    <section class="tool${hasIssues ? " has-issues" : ""}">
      <h3>${nameHtml}${badgesHtml}</h3>
      <p class="tool-desc">${tool.description ? escapeHtml(tool.description) : "<em>No description</em>"}</p>
      ${inputsHtml}
      ${outputsHtml}
      ${issuesHtml}
    </section>`;
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

  return `
    <dl class="summary">
      <div><dt>Tools</dt><dd>${stats.totalTools}</dd></div>
      <div><dt>Prompts</dt><dd>${promptsCount}</dd></div>
      <div><dt>Resources</dt><dd>${resourcesCount}</dd></div>
      <div><dt>Inputs</dt><dd>${stats.totalInputs}</dd></div>
      ${health ? `<div><dt>/health</dt><dd class="${health.available ? "ok" : "err"}">${health.available ? `${health.status} OK` : "unavailable"}</dd></div>` : ""}
      ${issues.length > 0 ? `<div class="issues"><dt>Issues</dt><dd>${issues.join(", ")}</dd></div>` : ""}
    </dl>`;
}

function renderResources(
  resources: Resource[] | null,
  supported: boolean,
): string {
  if (!supported) {
    return '<p class="empty">Not supported by server</p>';
  }
  if (resources === null) {
    return '<p class="empty">Unavailable</p>';
  }
  if (resources.length === 0) {
    return '<p class="empty">No resources exposed</p>';
  }

  const rows = resources
    .map((r) => {
      return `<tr>
        <td class="name"><code>${escapeHtml(r.name)}</code></td>
        <td class="type"><code>${escapeHtml(r.uri)}</code></td>
        <td class="desc">${r.description ? escapeHtml(r.description) : "—"}</td>
      </tr>`;
    })
    .join("");

  return `<table class="inputs"><tbody>${rows}</tbody></table>`;
}

function renderPrompts(prompts: Prompt[] | null, supported: boolean): string {
  if (!supported) {
    return '<p class="empty">Not supported by server</p>';
  }
  if (prompts === null) {
    return '<p class="empty">Unavailable</p>';
  }
  if (prompts.length === 0) {
    return '<p class="empty">No prompts exposed</p>';
  }

  const rows = prompts
    .map((p) => {
      const args =
        p.arguments && p.arguments.length > 0
          ? p.arguments
              .map((a) => `${a.required ? "*" : ""}${a.name}`)
              .join(", ")
          : "";

      return `<tr>
        <td class="name"><code>${escapeHtml(p.name)}</code></td>
        <td class="type">${args ? `<code>${escapeHtml(args)}</code>` : "—"}</td>
        <td class="desc">${p.description ? escapeHtml(p.description) : "—"}</td>
      </tr>`;
    })
    .join("");

  return `<table class="inputs"><tbody>${rows}</tbody></table>`;
}

const css = `
:root {
  --fg: #1a1a1a;
  --fg2: #555;
  --fg3: #888;
  --bg: #fff;
  --border: #e0e0e0;
  --accent: #5a4fcf;
  --warn: #b45309;
  --ok: #16a34a;
  --err: #dc2626;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fg: #e5e5e5;
    --fg2: #aaa;
    --fg3: #666;
    --bg: #111;
    --border: #2a2a2a;
  }
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font: 14px/1.5 -apple-system, system-ui, sans-serif;
  color: var(--fg);
  background: var(--bg);
  max-width: 720px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem;
}
header { margin-bottom: 1.5rem; }
h1 { font-size: 1rem; font-weight: 600; }
.meta { color: var(--fg3); font-size: 0.8rem; margin-top: 0.125rem; }
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.5rem;
  font-size: 0.8rem;
  padding: 0.75rem 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  margin-bottom: 2rem;
}
.summary div { display: flex; gap: 0.4rem; }
.summary dt { color: var(--fg3); }
.summary dd { color: var(--fg); }
.summary dd.ok { color: var(--ok); }
.summary dd.err { color: var(--err); }
.summary .issues dd { color: var(--warn); }
h2 {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg3);
  margin-bottom: 1rem;
}
.tool {
  margin-bottom: 1.75rem;
  padding-bottom: 1.75rem;
  border-bottom: 1px solid var(--border);
}
.tool:last-child { border-bottom: none; padding-bottom: 0; }
.tool.has-issues { border-left: 2px solid var(--warn); padding-left: 1rem; margin-left: -1rem; }
.tool h3 { font-size: 0.9rem; font-weight: 600; margin-bottom: 0.375rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.tool h3 code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; background: none; }
.tool-id { font-size: 0.75rem; color: var(--fg3); font-weight: 400; }
.badges { display: inline-flex; gap: 0.25rem; }
.badge { font-size: 0.65rem; font-weight: 500; padding: 0.1rem 0.4rem; border-radius: 3px; text-transform: lowercase; }
.badge-readonly { background: #dbeafe; color: #1e40af; }
.badge-destructive { background: #fee2e2; color: #991b1b; }
.badge-idempotent { background: #dcfce7; color: #166534; }
.badge-openworld { background: #f3e8ff; color: #6b21a8; }
@media (prefers-color-scheme: dark) {
  .badge-readonly { background: #1e3a5f; color: #93c5fd; }
  .badge-destructive { background: #450a0a; color: #fca5a5; }
  .badge-idempotent { background: #14532d; color: #86efac; }
  .badge-openworld { background: #3b0764; color: #d8b4fe; }
}
.tool-desc {
  color: var(--fg2);
  font-size: 0.85rem;
  line-height: 1.55;
  margin-bottom: 0.875rem;
  white-space: pre-wrap;
}
.tool-desc em { color: var(--fg3); }
.inputs { width: 100%; border-collapse: collapse; font-size: 0.8rem; table-layout: fixed; }
.inputs td { padding: 0.35rem 0; vertical-align: baseline; border-bottom: 1px solid var(--border); }
.inputs tr:last-child td { border-bottom: none; }
.inputs .name { width: 28%; word-break: break-all; overflow-wrap: anywhere; }
.inputs .type { width: 18%; }
.inputs .desc { width: 54%; color: var(--fg2); white-space: pre-wrap; }
.inputs code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 0.75rem; word-break: break-all; }
.inputs sup { color: var(--accent); font-weight: 600; margin-left: 2px; }
.inputs .type { color: var(--fg3); font-size: 0.7rem; }
.inputs .missing-desc .desc { color: var(--fg3); }
.issues { list-style: none; margin-top: 0.625rem; font-size: 0.75rem; color: var(--warn); }
.issues li { margin-bottom: 0.125rem; }
.issues li.info { color: var(--fg3); }
.issues code { font-size: 0.7rem; }
.empty { color: var(--fg3); font-size: 0.8rem; }
.section-label { font-size: 0.7rem; font-weight: 600; color: var(--fg3); margin: 0.75rem 0 0.375rem; }
h2 .timing { font-weight: 400; color: var(--fg3); }
footer {
  margin-top: 2.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
  font-size: 0.65rem;
  color: var(--fg3);
}
footer a {
  color: var(--fg3);
  text-decoration: none;
}
footer a:hover {
  color: var(--accent);
}
`;

export const htmlReporter: Reporter = (data: ReportData): string => {
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

  const toolsHtml =
    tools.length > 0
      ? tools.map((tool) => renderTool(tool, findings)).join("")
      : '<p class="empty">No tools exposed</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — MCP Vet</title>
  <style>${css}</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">${escapeHtml(target)}</p>
  </header>

  ${renderSummary(
    tools,
    resourcesSupported,
    promptsSupported,
    resources,
    prompts,
    findings,
    health,
  )}

  <h2>Tools ${toolsResponseTimeMs !== null ? `<span class="timing">(${toolsResponseTimeMs.toFixed(0)}ms)</span>` : ""}</h2>
  ${toolsHtml}

  <h2>Prompts ${promptsResponseTimeMs !== null ? `<span class="timing">(${promptsResponseTimeMs.toFixed(0)}ms)</span>` : ""}</h2>
  ${renderPrompts(prompts, promptsSupported)}

  <h2>Resources ${resourcesResponseTimeMs !== null ? `<span class="timing">(${resourcesResponseTimeMs.toFixed(0)}ms)</span>` : ""}</h2>
  ${renderResources(resources, resourcesSupported)}

  <footer><a href="https://github.com/boldare/mcp-farmer" target="_blank" rel="noopener noreferrer">mcp-farmer</a> · ${new Date().toISOString().split("T")[0]}</footer>
</body>
</html>`;
};
