import type {
  Prompt,
  Resource,
  Tool,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";

import {
  type Schema,
  extractToolSchema,
  formatType,
} from "../shared/schema.js";

export interface InstallMethod {
  type: "remote" | "local";
  value: string;
}

export interface DocHeader {
  name: string;
  placeholder: string;
}

export interface DocData {
  serverName?: string;
  serverVersion?: string;
  target: string;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
  installMethods?: InstallMethod[];
  headers?: DocHeader[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Icons from https://lucide.dev/
const icons = {
  tool: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench-icon lucide-wrench"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/></svg>`,
  resource: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-icon lucide-folder"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
  prompt: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-icon lucide-message-square"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>`,
  setup: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>`,
};

function renderAnnotationBadges(
  annotations: ToolAnnotations | undefined,
): string {
  if (!annotations) return "";

  const badges: string[] = [];

  if (annotations.readOnlyHint) {
    badges.push('<mark class="badge badge-readonly">read-only</mark>');
  }
  if (annotations.destructiveHint) {
    badges.push('<mark class="badge badge-destructive">destructive</mark>');
  }
  if (annotations.idempotentHint) {
    badges.push('<mark class="badge badge-idempotent">idempotent</mark>');
  }
  if (annotations.openWorldHint) {
    badges.push('<mark class="badge badge-openworld">open-world</mark>');
  }

  return badges.length > 0
    ? `<div class="badges" role="group" aria-label="Tool annotations">${badges.join("")}</div>`
    : "";
}

function generateExample(tool: Tool): string {
  const { properties, required } = extractToolSchema(tool);
  const example: Record<string, unknown> = {};

  for (const [name, prop] of Object.entries(properties)) {
    const type = prop.type;
    const isRequired = required.has(name);

    if (type === "string") {
      example[name] = isRequired ? `example_${name}` : `optional_${name}`;
    } else if (type === "number" || type === "integer") {
      example[name] = 42;
    } else if (type === "boolean") {
      example[name] = true;
    } else if (type === "array") {
      example[name] = [];
    } else if (type === "object") {
      example[name] = {};
    } else {
      example[name] = `<${name}>`;
    }
  }

  return JSON.stringify(example, null, 2);
}

function renderToolCard(tool: Tool, isFirst = false): string {
  const { properties, required, propNames } = extractToolSchema(tool);
  const slug = slugify(tool.name);
  const displayName = tool.annotations?.title ?? tool.name;

  const nameHtml = tool.annotations?.title
    ? `<span class="tool-title">${escapeHtml(displayName)}</span> <span class="tool-id">${escapeHtml(tool.name)}</span>`
    : `<span class="tool-title">${escapeHtml(tool.name)}</span>`;

  let inputsHtml = "";
  if (propNames.length === 0) {
    inputsHtml = '<p class="empty-state">No inputs required</p>';
  } else {
    const params = propNames
      .map((name) => {
        const prop = properties[name];
        if (!prop) return "";
        const isRequired = required.has(name);
        const type = formatType(prop);
        const desc = prop.description;

        return `
          <div class="param-item">
            <div class="param-header">
              <code class="param-name">${escapeHtml(name)}</code>
              <span class="param-type">${escapeHtml(type)}</span>
              ${isRequired ? '<span class="required-badge">required</span>' : ''}
            </div>
            <p class="param-desc">${desc ? escapeHtml(desc) : '<span class="no-desc">No description</span>'}</p>
          </div>`;
      })
      .join("");

    inputsHtml = `
      <div class="params-section">
        <h4 class="section-title">Parameters</h4>
        <div class="params-list">${params}</div>
      </div>`;
  }

  const outputSchema = (tool as Tool & { outputSchema?: Schema }).outputSchema;
  let outputsHtml = "";
  if (outputSchema) {
    const outputProps = outputSchema.properties ?? {};
    const outputPropNames = Object.keys(outputProps);

    if (outputPropNames.length > 0) {
      const params = outputPropNames
        .map((name) => {
          const prop = outputProps[name];
          if (!prop) return "";
          const type = formatType(prop);
          const desc = prop.description;

          return `
            <div class="param-item">
              <div class="param-header">
                <code class="param-name">${escapeHtml(name)}</code>
                <span class="param-type">${escapeHtml(type)}</span>
              </div>
              <p class="param-desc">${desc ? escapeHtml(desc) : '<span class="no-desc">No description</span>'}</p>
            </div>`;
        })
        .join("");

      outputsHtml = `
        <div class="params-section">
          <h4 class="section-title">Response</h4>
          <div class="params-list">${params}</div>
        </div>`;
    }
  }

  const exampleJson = generateExample(tool);
  const exampleHtml =
    propNames.length > 0
      ? `
      <div class="example-section">
        <h4 class="section-title">Example</h4>
        <pre class="code-block"><code>${escapeHtml(exampleJson)}</code></pre>
      </div>`
      : "";

  return `
    <details id="tool-${slug}" class="card tool-card"${isFirst ? " open" : ""}>
      <summary class="card-header">
        <div class="card-title-row">
          <h3 class="card-title">${nameHtml}</h3>
        </div>
        ${renderAnnotationBadges(tool.annotations)}
      </summary>
      <div class="card-content">
        <p class="card-description">${tool.description ? escapeHtml(tool.description) : '<em>No description provided</em>'}</p>
        ${inputsHtml}
        ${outputsHtml}
        ${exampleHtml}
      </div>
    </details>`;
}

function renderResourceCard(resource: Resource, isFirst = false): string {
  const slug = slugify(resource.uri);

  return `
    <details id="resource-${slug}" class="card resource-card"${isFirst ? " open" : ""}>
      <summary class="card-header">
        <div class="card-title-row">
          <h3 class="card-title">${escapeHtml(resource.name)}</h3>
        </div>
      </summary>
      <div class="card-content">
        <p class="card-uri"><code>${escapeHtml(resource.uri)}</code></p>
        <p class="card-description">${resource.description ? escapeHtml(resource.description) : '<em>No description provided</em>'}</p>
      </div>
    </details>`;
}

function renderPromptCard(prompt: Prompt, isFirst = false): string {
  const slug = slugify(prompt.name);
  const args = prompt.arguments ?? [];

  let argsHtml = "";
  if (args.length > 0) {
    const params = args
      .map((arg) => {
        return `
          <div class="param-item">
            <div class="param-header">
              <code class="param-name">${escapeHtml(arg.name)}</code>
              ${arg.required ? '<span class="required-badge">required</span>' : ''}
            </div>
            <p class="param-desc">${arg.description ? escapeHtml(arg.description) : '<span class="no-desc">No description</span>'}</p>
          </div>`;
      })
      .join("");

    argsHtml = `
      <div class="params-section">
        <h4 class="section-title">Arguments</h4>
        <div class="params-list">${params}</div>
      </div>`;
  }

  return `
    <details id="prompt-${slug}" class="card prompt-card"${isFirst ? " open" : ""}>
      <summary class="card-header">
        <div class="card-title-row">
          <h3 class="card-title">${escapeHtml(prompt.name)}</h3>
        </div>
      </summary>
      <div class="card-content">
        <p class="card-description">${prompt.description ? escapeHtml(prompt.description) : '<em>No description provided</em>'}</p>
        ${argsHtml}
      </div>
    </details>`;
}

function renderSidebarItem(
  type: "tool" | "resource" | "prompt",
  name: string,
  uri?: string,
): string {
  const slug = slugify(uri ?? name);

  return `
    <a href="#${type}-${slug}" class="sidebar-item">
      <span class="sidebar-label">${escapeHtml(name)}</span>
    </a>`;
}

function renderCopyButton(textToCopy: string): string {
  return `
    <button class="copy-btn" data-copy="${escapeHtml(textToCopy)}" aria-label="Copy to clipboard" title="Copy to clipboard">
      <span class="copy-icon">${icons.copy}</span>
      <span class="check-icon">${icons.check}</span>
    </button>`;
}

function renderClientSection(
  clientName: string,
  description: string,
  code: string,
): string {
  const slug = slugify(clientName);
  return `
        <details id="client-${slug}" class="client-accordion">
          <summary class="client-header">
            <h3 class="client-title">${escapeHtml(clientName)}</h3>
          </summary>
          <div class="client-content">
            <p class="install-desc">${escapeHtml(description)}</p>
            <div class="code-with-copy">
              <pre class="code-block code-block-inline"><code>${escapeHtml(code)}</code></pre>
              ${renderCopyButton(code)}
            </div>
          </div>
        </details>`;
}

function renderRemoteSection(
  url: string,
  serverName: string,
  headers: DocHeader[],
): string {
  const safeName = serverName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const headerFlags = headers
    .map((h) => `--header "${h.name}: \${${h.placeholder}}"`)
    .join(" ");
  const claudeCmd = `claude mcp add --transport http ${safeName} ${url}${headerFlags ? ` ${headerFlags}` : ""}`;

  const openCodeConfig = JSON.stringify(
    {
      mcp: {
        [safeName]: {
          type: "remote",
          url: url,
          enabled: true,
          ...(headers.length > 0
            ? {
                headers: Object.fromEntries(
                  headers.map((h) => [h.name, `\${${h.placeholder}}`]),
                ),
              }
            : {}),
        },
      },
    },
    null,
    2,
  );

  return `
    <section id="setup-remote" class="section setup-section">
      <div class="setup-breadcrumb">MCP &bull; SETUP</div>
      <h2 class="setup-title">Remote setup</h2>
      <p class="setup-description">
        Connect to the MCP server via <code class="inline-code">HTTP/SSE</code> transport.
        Use the remote URL directly or configure it in your preferred MCP client:
      </p>
      <div class="code-with-copy">
        <pre class="code-block code-block-inline"><code>${escapeHtml(url)}</code></pre>
        ${renderCopyButton(url)}
      </div>
      <p class="setup-clients-intro">Here's how to set it up in some common MCP clients:</p>
      ${renderClientSection("Claude Code", "Add this server to Claude Code:", claudeCmd)}
      ${renderClientSection("OpenCode", "Add this to your opencode.json:", openCodeConfig)}
    </section>`;
}

function renderLocalSection(
  command: string,
  serverName: string,
  headers: DocHeader[],
): string {
  const safeName = serverName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const envFlags = headers
    .map((h) => `-e ${h.placeholder}`)
    .join(" ");
  const claudeCmd = `claude mcp add ${safeName}${envFlags ? ` ${envFlags}` : ""} -- ${command}`;
  const commandParts = command.split(/\s+/).filter(Boolean);

  const openCodeConfig = JSON.stringify(
    {
      mcp: {
        [safeName]: {
          type: "local",
          command: commandParts,
          enabled: true,
          ...(headers.length > 0
            ? {
                env: Object.fromEntries(
                  headers.map((h) => [h.placeholder, `<your ${h.name} value>`]),
                ),
              }
            : {}),
        },
      },
    },
    null,
    2,
  );

  return `
    <section id="setup-local" class="section setup-section">
      <div class="setup-breadcrumb">MCP &bull; SETUP</div>
      <h2 class="setup-title">Local setup</h2>
      <p class="setup-description">
        Run the MCP server locally via <code class="inline-code">stdio</code> transport.
        You can run the command directly or configure it in your preferred MCP client:
      </p>
      <div class="code-with-copy">
        <pre class="code-block code-block-inline"><code>${escapeHtml(command)}</code></pre>
        ${renderCopyButton(command)}
      </div>
      <p class="setup-clients-intro">Here's how to set it up in some common MCP clients:</p>
      ${renderClientSection("Claude Code", "Add this server to Claude Code:", claudeCmd)}
      ${renderClientSection("OpenCode", "Add this to your opencode.json:", openCodeConfig)}
    </section>`;
}

function renderSetupSections(
  installMethods: InstallMethod[],
  serverName: string,
  headers: DocHeader[],
): string {
  if (installMethods.length === 0) {
    return "";
  }

  return installMethods
    .map((method) =>
      method.type === "remote"
        ? renderRemoteSection(method.value, serverName, headers)
        : renderLocalSection(method.value, serverName, headers),
    )
    .join("");
}

function renderSetupSidebarItems(installMethods: InstallMethod[]): string {
  if (installMethods.length === 0) {
    return "";
  }

  const hasRemote = installMethods.some((m) => m.type === "remote");
  const hasLocal = installMethods.some((m) => m.type === "local");

  let items = "";
  if (hasRemote) {
    items += `
        <a href="#setup-remote" class="sidebar-item">
          <span class="sidebar-label">Remote setup</span>
        </a>`;
  }
  if (hasLocal) {
    items += `
        <a href="#setup-local" class="sidebar-item">
          <span class="sidebar-label">Local setup</span>
        </a>`;
  }

  return `
      <div class="sidebar-section">
        <div class="sidebar-heading"><span class="sidebar-heading-icon">${icons.setup}</span>Setup</div>
        ${items}
      </div>`;
}

const css = `
:root {
  color-scheme: light dark;
  --primary: #6652e4;
  --primary-light: #8b7cf0;
  --accent: #f1d624;
  --bg: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-tertiary: #f1f5f9;
  --text: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --border: #e2e8f0;
  --border-light: #f1f5f9;
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --sidebar-width: 280px;
  --header-height: 64px;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  /* Dark mode color overrides */
  --bg-dark: #0d1117;
  --bg-secondary-dark: #161b22;
  --bg-tertiary-dark: #21262d;
  --text-dark: #e6edf3;
  --text-secondary-dark: #8b949e;
  --text-muted-dark: #6e7681;
  --border-dark: #30363d;
  --border-light-dark: #21262d;
  /* Badge colors */
  --badge-readonly-bg: #dbeafe;
  --badge-readonly-color: #1e40af;
  --badge-destructive-bg: #fee2e2;
  --badge-destructive-color: #991b1b;
  --badge-idempotent-bg: #dcfce7;
  --badge-idempotent-color: #166534;
  --badge-openworld-bg: #f3e8ff;
  --badge-openworld-color: #6b21a8;
  --badge-required-bg: rgba(241, 214, 36, 0.2);
  --badge-required-color: #a08c00;
  --install-remote-bg: #dbeafe;
  --install-remote-color: #1e40af;
  --install-local-bg: #dcfce7;
  --install-local-color: #166534;
}

[data-theme="dark"], :root:is([data-theme="dark"]) {
  color-scheme: dark;
  --bg: var(--bg-dark);
  --bg-secondary: var(--bg-secondary-dark);
  --bg-tertiary: var(--bg-tertiary-dark);
  --text: var(--text-dark);
  --text-secondary: var(--text-secondary-dark);
  --text-muted: var(--text-muted-dark);
  --border: var(--border-dark);
  --border-light: var(--border-light-dark);
  --badge-readonly-bg: #1e3a5f;
  --badge-readonly-color: #93c5fd;
  --badge-destructive-bg: #450a0a;
  --badge-destructive-color: #fca5a5;
  --badge-idempotent-bg: #14532d;
  --badge-idempotent-color: #86efac;
  --badge-openworld-bg: #3b0764;
  --badge-openworld-color: #d8b4fe;
  --badge-required-bg: rgba(241, 214, 36, 0.15);
  --badge-required-color: #f1d624;
  --install-remote-bg: #1e3a5f;
  --install-remote-color: #93c5fd;
  --install-local-bg: #14532d;
  --install-local-color: #86efac;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: var(--bg-dark);
    --bg-secondary: var(--bg-secondary-dark);
    --bg-tertiary: var(--bg-tertiary-dark);
    --text: var(--text-dark);
    --text-secondary: var(--text-secondary-dark);
    --text-muted: var(--text-muted-dark);
    --border: var(--border-dark);
    --border-light: var(--border-light-dark);
    --badge-readonly-bg: #1e3a5f;
    --badge-readonly-color: #93c5fd;
    --badge-destructive-bg: #450a0a;
    --badge-destructive-color: #fca5a5;
    --badge-idempotent-bg: #14532d;
    --badge-idempotent-color: #86efac;
    --badge-openworld-bg: #3b0764;
    --badge-openworld-color: #d8b4fe;
    --badge-required-bg: rgba(241, 214, 36, 0.15);
    --badge-required-color: #f1d624;
    --install-remote-bg: #1e3a5f;
    --install-remote-color: #93c5fd;
    --install-local-bg: #14532d;
    --install-local-color: #86efac;
  }
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  scroll-padding-top: calc(var(--header-height) + 24px);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: 'kern' 1, 'liga' 1;
}

/* Header */
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 24px;
  z-index: 100;
  gap: 16px;
  justify-content: space-between;
}

.header-title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.header-version {
  margin-left: 8px;
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 400;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-toggle {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}

.theme-toggle:hover {
  background: var(--bg-secondary);
  color: var(--text);
}

.theme-toggle svg {
  width: 18px;
  height: 18px;
}

.icon-sun { display: none; }
.icon-moon { display: block; }

[data-theme="dark"] .icon-sun { display: block; }
[data-theme="dark"] .icon-moon { display: none; }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .icon-sun { display: block; }
  :root:not([data-theme="light"]) .icon-moon { display: none; }
}

/* Sidebar */
.sidebar {
  position: fixed;
  top: var(--header-height);
  left: 0;
  bottom: 0;
  width: var(--sidebar-width);
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 16px 0;
}

.sidebar-search {
  padding: 0 16px 16px;
}

.search-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: all 0.15s ease;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(102, 82, 228, 0.15);
}

.sidebar-section {
  margin-bottom: 20px;
}

.sidebar-heading {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 8px 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.sidebar-heading-icon {
  display: flex;
  align-items: center;
  opacity: 0.7;
}

.sidebar-heading-icon svg {
  width: 14px;
  height: 14px;
}

.sidebar-count {
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  transition: all 0.15s ease;
}

.sidebar-item:hover {
  background: var(--bg-tertiary);
  color: var(--text);
}

.sidebar-item.hidden {
  display: none;
}

.sidebar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Main content */
.main {
  margin-left: var(--sidebar-width);
  margin-top: var(--header-height);
  padding: 32px 48px;
  max-width: 900px;
}

/* Section */
.section {
  margin-bottom: 56px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.section-icon {
  opacity: 0.8;
  display: flex;
  align-items: center;
}

.section-icon svg {
  width: 24px;
  height: 24px;
}

.section-name {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.section-count {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 3px 10px;
  border-radius: 12px;
}

/* Card (Accordion) */
.card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 16px;
}

.card:target {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.card-header {
  padding: 24px;
  cursor: pointer;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  padding-right: 48px;
}

.card-header::-webkit-details-marker {
  display: none;
}

.card-header::after {
  content: '';
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--text-muted);
  border-bottom: 2px solid var(--text-muted);
  transform: translateY(-50%) rotate(-45deg);
  transition: transform 0.15s ease;
}

.card[open] > .card-header::after {
  transform: translateY(-50%) rotate(45deg);
}

.card-header:hover {
  background: var(--bg-secondary);
}

.card-content {
  padding: 0 24px 24px;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-title {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-wrap: balance;
}

.tool-title {
  color: var(--text);
}

.tool-id {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 400;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

.card-description {
  color: var(--text-secondary);
  margin: 0 0 20px;
  line-height: 1.75;
  font-size: 15px;
  white-space: pre-wrap;
}

.card-description:last-child {
  margin-bottom: 0;
}

.card-uri {
  margin-bottom: 12px;
}

.card-uri code {
  font-size: 13px;
  background: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

/* Badges */
.badges {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.badge {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 4px;
  text-transform: lowercase;
}

.badge-readonly {
  background: var(--badge-readonly-bg);
  color: var(--badge-readonly-color);
}

.badge-destructive {
  background: var(--badge-destructive-bg);
  color: var(--badge-destructive-color);
}

.badge-idempotent {
  background: var(--badge-idempotent-bg);
  color: var(--badge-idempotent-color);
}

.badge-openworld {
  background: var(--badge-openworld-bg);
  color: var(--badge-openworld-color);
}

.required-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--badge-required-bg);
  color: var(--badge-required-color);
  text-transform: lowercase;
}

/* Params list (vertical layout) */
.params-section {
  margin-top: 24px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.params-list {
  display: flex;
  flex-direction: column;
}

.param-item {
  padding: 16px 0;
  border-top: 1px solid var(--border-light);
}

.param-item:first-child {
  border-top: none;
  padding-top: 0;
}

.param-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.param-name {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
}

.param-type {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
}

.param-desc {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
  margin: 0;
  white-space: pre-wrap;
}

.no-desc {
  color: var(--text-muted);
  font-style: italic;
}

/* Example */
.example-section {
  margin-top: 20px;
}

.code-block {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
}

.code-block code {
  color: var(--text);
}

/* Empty state */
.empty-state {
  color: var(--text-muted);
  font-style: italic;
  padding: 12px 0;
}

/* Visually hidden (for accessibility) */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Setup section */
.setup-section {
  padding-bottom: 48px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 48px;
}

.setup-section:last-of-type {
  border-bottom: none;
}

.setup-breadcrumb {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}

.setup-title {
  font-family: Georgia, 'Times New Roman', Times, serif;
  font-size: 42px;
  font-weight: 400;
  color: var(--text);
  margin: 0 0 24px;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.setup-description {
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.8;
  margin-bottom: 20px;
  max-width: 700px;
}

.inline-code {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.9em;
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--text);
}

.setup-clients-intro {
  color: var(--text-secondary);
  font-size: 15px;
  margin-top: 32px;
  margin-bottom: 8px;
}

.install-desc {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 12px;
}

/* Client accordion */
.client-accordion {
  margin-top: 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.client-accordion:first-of-type {
  margin-top: 24px;
}

.client-header {
  padding: 20px 24px;
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  position: relative;
  padding-right: 48px;
}

.client-header::-webkit-details-marker {
  display: none;
}

.client-header::after {
  content: '';
  position: absolute;
  right: 24px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--text-muted);
  border-bottom: 2px solid var(--text-muted);
  transform: translateY(-50%) rotate(-45deg);
  transition: transform 0.15s ease;
}

.client-accordion[open] > .client-header::after {
  transform: translateY(-50%) rotate(45deg);
}

.client-header:hover {
  background: var(--bg-secondary);
}

.client-content {
  padding: 0 24px 24px;
}

.client-title {
  font-family: Georgia, 'Times New Roman', Times, serif;
  font-size: 22px;
  font-weight: 400;
  color: var(--text);
  margin: 0;
  letter-spacing: -0.01em;
}

.code-with-copy {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.code-block-inline {
  flex: 1;
  margin: 0;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.copy-btn:hover {
  background: var(--bg-secondary);
  color: var(--text);
  border-color: var(--primary);
}

.copy-btn:active {
  transform: scale(0.95);
}

.copy-btn .copy-icon {
  display: flex;
}

.copy-btn .check-icon {
  display: none;
  color: var(--success);
}

.copy-btn.copied .copy-icon {
  display: none;
}

.copy-btn.copied .check-icon {
  display: flex;
}

.copy-btn.copied {
  border-color: var(--success);
  background: rgba(16, 185, 129, 0.1);
}

/* Footer */
.footer {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-muted);
}

.footer a {
  color: var(--primary);
  text-decoration: none;
}

.footer a:hover {
  text-decoration: underline;
}

/* Responsive */
@media (max-width: 768px) {
  .sidebar {
    display: none;
  }
  .main {
    margin-left: 0;
    padding: 24px 16px;
  }
}
`;

export function generateDocHtml(data: DocData): string {
  const {
    serverName,
    serverVersion,
    tools,
    resources,
    prompts,
    installMethods = [],
    headers = [],
  } = data;

  const title = serverName ?? "MCP Server";
  const version = serverVersion ? `v${serverVersion}` : "";

  // Sidebar items
  const toolsSidebar =
    tools.length > 0
      ? tools.map((t) => renderSidebarItem("tool", t.name)).join("")
      : "";

  const resourcesSidebar =
    resources.length > 0
      ? resources
          .map((r) => renderSidebarItem("resource", r.name, r.uri))
          .join("")
      : "";

  const promptsSidebar =
    prompts.length > 0
      ? prompts.map((p) => renderSidebarItem("prompt", p.name)).join("")
      : "";

  // Setup sections (Remote/Local)
  const setupContent = renderSetupSections(installMethods, title, headers);
  const setupSidebarItems = renderSetupSidebarItems(installMethods);

  // Main content
  const toolsContent = tools.map((t, i) => renderToolCard(t, i === 0)).join("");
  const resourcesContent = resources
    .map((r, i) => renderResourceCard(r, i === 0))
    .join("");
  const promptsContent = prompts
    .map((p, i) => renderPromptCard(p, i === 0))
    .join("");

  const js = `
(function() {
  // Theme toggle
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');

  function getStoredTheme() {
    return localStorage.getItem('theme');
  }

  function setTheme(theme) {
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    } else {
      root.removeAttribute('data-theme');
      localStorage.removeItem('theme');
    }
  }

  // Initialize theme from localStorage
  const stored = getStoredTheme();
  if (stored) {
    setTheme(stored);
  }

  toggle.addEventListener('click', function() {
    const current = root.getAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (current === 'dark') {
      setTheme('light');
    } else if (current === 'light') {
      setTheme('dark');
    } else {
      // No explicit theme set, toggle based on system preference
      setTheme(prefersDark ? 'light' : 'dark');
    }
  });

  // Search functionality
  const searchInput = document.getElementById('search-input');
  const sidebarItems = document.querySelectorAll('.sidebar-item');

  searchInput.addEventListener('input', function(e) {
    const query = e.target.value.toLowerCase().trim();

    sidebarItems.forEach(function(item) {
      const label = item.querySelector('.sidebar-label');
      const text = label ? label.textContent.toLowerCase() : '';

      if (query === '' || text.includes(query)) {
        item.classList.remove('hidden');
      } else {
        item.classList.add('hidden');
      }
    });
  });

  // Navigate and scroll to first match on Enter
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      const visibleItems = document.querySelectorAll('.sidebar-item:not(.hidden)');
      if (visibleItems.length > 0) {
        const href = visibleItems[0].getAttribute('href');
        if (href) {
          window.location.hash = href;
          searchInput.blur();
        }
      }
    }
  });

  // Copy button functionality
  document.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const textToCopy = btn.getAttribute('data-copy');
      if (!textToCopy) return;

      navigator.clipboard.writeText(textToCopy).then(function() {
        btn.classList.add('copied');
        setTimeout(function() {
          btn.classList.remove('copied');
        }, 2000);
      }).catch(function(err) {
        console.error('Failed to copy:', err);
      });
    });
  });
})();
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — Documentation</title>
  <style>${css}</style>
</head>
<body>
  <header class="header">
    <h1 class="header-title">${escapeHtml(title)}<span class="header-version">${escapeHtml(version)}</span></h1>
    <div class="header-actions">
      <button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme">
        <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
        <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      </button>
    </div>
  </header>

  <aside class="sidebar">
    <div class="sidebar-search" role="search">
      <label for="search-input" class="visually-hidden">Search documentation</label>
      <input type="text" id="search-input" class="search-input" placeholder="Search..." autocomplete="off">
    </div>
    <nav aria-label="Documentation navigation">
    ${setupSidebarItems}
    ${
      tools.length > 0
        ? `
      <div class="sidebar-section" aria-labelledby="sidebar-tools-heading">
        <div id="sidebar-tools-heading" class="sidebar-heading"><span class="sidebar-heading-icon">${icons.tool}</span>Tools <span class="sidebar-count">${tools.length}</span></div>
        ${toolsSidebar}
      </div>`
        : ""
    }
    ${
      resources.length > 0
        ? `
      <div class="sidebar-section" aria-labelledby="sidebar-resources-heading">
        <div id="sidebar-resources-heading" class="sidebar-heading"><span class="sidebar-heading-icon">${icons.resource}</span>Resources <span class="sidebar-count">${resources.length}</span></div>
        ${resourcesSidebar}
      </div>`
        : ""
    }
    ${
      prompts.length > 0
        ? `
      <div class="sidebar-section" aria-labelledby="sidebar-prompts-heading">
        <div id="sidebar-prompts-heading" class="sidebar-heading"><span class="sidebar-heading-icon">${icons.prompt}</span>Prompts <span class="sidebar-count">${prompts.length}</span></div>
        ${promptsSidebar}
      </div>`
        : ""
    }
    </nav>
  </aside>

  <main class="main">
    ${setupContent}

    ${
      tools.length > 0
        ? `
    <section id="tools" class="section">
      <div class="section-header">
        <span class="section-icon">${icons.tool}</span>
        <h2 class="section-name">Tools</h2>
        <span class="section-count">${tools.length}</span>
      </div>
      ${toolsContent}
    </section>`
        : ""
    }

    ${
      resources.length > 0
        ? `
    <section id="resources" class="section">
      <div class="section-header">
        <span class="section-icon">${icons.resource}</span>
        <h2 class="section-name">Resources</h2>
        <span class="section-count">${resources.length}</span>
      </div>
      ${resourcesContent}
    </section>`
        : ""
    }

    ${
      prompts.length > 0
        ? `
    <section id="prompts" class="section">
      <div class="section-header">
        <span class="section-icon">${icons.prompt}</span>
        <h2 class="section-name">Prompts</h2>
        <span class="section-count">${prompts.length}</span>
      </div>
      ${promptsContent}
    </section>`
        : ""
    }

    <footer class="footer">
      Generated by <a href="https://github.com/boldare/mcp-farmer" target="_blank" rel="noopener noreferrer">mcp-farmer</a> · ${new Date().toISOString().split("T")[0]}
    </footer>
  </main>
  <script>${js}</script>
</body>
</html>`;
}
