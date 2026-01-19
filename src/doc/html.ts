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

import { css } from "./styles.js";
import { clientScript, icons } from "./scripts.js";

export interface InstallMethod {
  type: "remote" | "local";
  value: string;
}

export interface DocHeader {
  name: string;
  placeholder: string;
}

export interface DocEnvVar {
  name: string;
  placeholder: string;
}

export interface DocSection {
  title: string;
  content: string;
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
  envVars?: DocEnvVar[];
  sections?: DocSection[];
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
              ${isRequired ? '<span class="required-badge">required</span>' : ""}
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
        <p class="card-description">${tool.description ? escapeHtml(tool.description) : "<em>No description provided</em>"}</p>
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
        <p class="card-description">${resource.description ? escapeHtml(resource.description) : "<em>No description provided</em>"}</p>
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
              ${arg.required ? '<span class="required-badge">required</span>' : ""}
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
        <p class="card-description">${prompt.description ? escapeHtml(prompt.description) : "<em>No description provided</em>"}</p>
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
  envVars: DocEnvVar[],
): string {
  const safeName = serverName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const envFlags = envVars.map((e) => `-e ${e.name}`).join(" ");
  const claudeCmd = `claude mcp add ${safeName}${envFlags ? ` ${envFlags}` : ""} -- ${command}`;
  const commandParts = command.split(/\s+/).filter(Boolean);

  const openCodeConfig = JSON.stringify(
    {
      mcp: {
        [safeName]: {
          type: "local",
          command: commandParts,
          enabled: true,
          ...(envVars.length > 0
            ? {
                env: Object.fromEntries(
                  envVars.map((e) => [e.name, e.placeholder]),
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
  envVars: DocEnvVar[],
): string {
  if (installMethods.length === 0) {
    return "";
  }

  return installMethods
    .map((method) =>
      method.type === "remote"
        ? renderRemoteSection(method.value, serverName, headers)
        : renderLocalSection(method.value, serverName, envVars),
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

function renderCustomSection(section: DocSection): string {
  const slug = slugify(section.title);
  return `
    <section id="section-${slug}" class="section custom-section">
      <h2 class="custom-section-title">${escapeHtml(section.title)}</h2>
      <p class="custom-section-content">${escapeHtml(section.content)}</p>
    </section>`;
}

function renderCustomSections(sections: DocSection[]): string {
  if (sections.length === 0) {
    return "";
  }
  return sections.map((section) => renderCustomSection(section)).join("");
}

function renderCustomSectionsSidebarItems(sections: DocSection[]): string {
  if (sections.length === 0) {
    return "";
  }

  const items = sections
    .map((section) => {
      const slug = slugify(section.title);
      return `
        <a href="#section-${slug}" class="sidebar-item">
          <span class="sidebar-label">${escapeHtml(section.title)}</span>
        </a>`;
    })
    .join("");

  return `
      <div class="sidebar-section">
        <div class="sidebar-heading"><span class="sidebar-heading-icon">${icons.info}</span>About</div>
        ${items}
      </div>`;
}

export function generateDocHtml(data: DocData): string {
  const {
    serverName,
    serverVersion,
    tools,
    resources,
    prompts,
    installMethods = [],
    headers = [],
    envVars = [],
    sections = [],
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

  // Custom sections
  const customSectionsContent = renderCustomSections(sections);
  const customSectionsSidebarItems = renderCustomSectionsSidebarItems(sections);

  // Setup sections (Remote/Local)
  const setupContent = renderSetupSections(
    installMethods,
    title,
    headers,
    envVars,
  );
  const setupSidebarItems = renderSetupSidebarItems(installMethods);

  // Main content
  const toolsContent = tools.map((t, i) => renderToolCard(t, i === 0)).join("");
  const resourcesContent = resources
    .map((r, i) => renderResourceCard(r, i === 0))
    .join("");
  const promptsContent = prompts
    .map((p, i) => renderPromptCard(p, i === 0))
    .join("");

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
    ${customSectionsSidebarItems}
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
    ${customSectionsContent}
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
  <script>${clientScript}</script>
</body>
</html>`;
}
