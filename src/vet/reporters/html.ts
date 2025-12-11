import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { Finding, Schema } from "../tools.js";
import type { HealthCheckResult } from "../health.js";
import {
  type Reporter,
  type ReportData,
  formatType,
  getToolFindings,
} from "./shared.js";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTool(tool: Tool, findings: Finding[]): string {
  const schema = tool.inputSchema as Schema | undefined;
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const propNames = Object.keys(properties);
  const toolFindings = getToolFindings(findings, tool.name);
  const hasIssues = toolFindings.length > 0;

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

    inputsHtml = `<table class="inputs"><tbody>${rows}</tbody></table>`;
  }

  const issuesHtml =
    hasIssues && toolFindings.length > 0
      ? `<ul class="issues">${toolFindings.map((f) => `<li>⚠ ${escapeHtml(f.message)}${f.inputName ? `: <code>${escapeHtml(f.inputName)}</code>` : ""}</li>`).join("")}</ul>`
      : "";

  return `
    <section class="tool${hasIssues ? " has-issues" : ""}">
      <h3><code>${escapeHtml(tool.name)}</code></h3>
      <p class="tool-desc">${tool.description ? escapeHtml(tool.description) : "<em>No description</em>"}</p>
      ${inputsHtml}
      ${issuesHtml}
    </section>`;
}

function renderSummary(
  tools: Tool[],
  findings: Finding[],
  health: HealthCheckResult | null,
  responseMs: number,
): string {
  const toolDescMissing = findings.filter(
    (f) => f.message === "Missing tool description",
  ).length;
  const inputDescMissing = findings.filter(
    (f) => f.message === "Missing input description",
  ).length;

  let totalInputs = 0;
  for (const tool of tools) {
    const schema = tool.inputSchema as Schema | undefined;
    totalInputs += Object.keys(schema?.properties ?? {}).length;
  }

  const issues: string[] = [];
  if (toolDescMissing > 0) issues.push(`${toolDescMissing} tool desc missing`);
  if (inputDescMissing > 0)
    issues.push(`${inputDescMissing} input desc missing`);

  return `
    <dl class="summary">
      <div><dt>Tools</dt><dd>${tools.length}</dd></div>
      <div><dt>Inputs</dt><dd>${totalInputs}</dd></div>
      <div><dt>Response</dt><dd>${responseMs.toFixed(0)}ms</dd></div>
      <div><dt>/health</dt><dd class="${health ? (health.available ? "ok" : "err") : ""}">${health ? (health.available ? `${health.status} OK` : "unavailable") : "not checked"}</dd></div>
      ${issues.length > 0 ? `<div class="issues"><dt>Issues</dt><dd>${issues.join(", ")}</dd></div>` : ""}
    </dl>`;
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
.tool h3 { font-size: 0.9rem; font-weight: 600; margin-bottom: 0.375rem; }
.tool h3 code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; background: none; }
.tool-desc {
  color: var(--fg2);
  font-size: 0.85rem;
  line-height: 1.55;
  margin-bottom: 0.875rem;
}
.tool-desc em { color: var(--fg3); }
.inputs { width: 100%; border-collapse: collapse; font-size: 0.8rem; table-layout: fixed; }
.inputs td { padding: 0.35rem 0; vertical-align: baseline; border-bottom: 1px solid var(--border); }
.inputs tr:last-child td { border-bottom: none; }
.inputs .name { width: 28%; }
.inputs .type { width: 18%; }
.inputs .desc { width: 54%; }
.inputs code { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 0.75rem; }
.inputs sup { color: var(--accent); font-weight: 600; margin-left: 2px; }
.inputs .type { color: var(--fg3); font-size: 0.7rem; }
.inputs .desc { color: var(--fg2); }
.inputs .missing-desc .desc { color: var(--fg3); }
.issues { list-style: none; margin-top: 0.625rem; font-size: 0.75rem; color: var(--warn); }
.issues li { margin-bottom: 0.125rem; }
.issues code { font-size: 0.7rem; }
.empty { color: var(--fg3); font-size: 0.8rem; }
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
    url,
    tools,
    findings,
    health,
    toolsResponseTimeMs,
  } = data;

  const title =
    serverName && serverVersion ? `${serverName} v${serverVersion}` : url;

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
    <p class="meta">${escapeHtml(url)}</p>
  </header>

  ${renderSummary(tools, findings, health, toolsResponseTimeMs)}

  <h2>Tools</h2>
  ${toolsHtml}

  <footer><a href="https://github.com/boldare/mcp-farmer" target="_blank" rel="noopener noreferrer">mcp-farmer</a> · ${new Date().toISOString().split("T")[0]}</footer>
</body>
</html>`;
};
