export const css = `
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

/* Custom sections */
.custom-section {
  padding-bottom: 48px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 48px;
}

.custom-section:last-of-type {
  border-bottom: none;
}

.custom-section-title {
  font-family: Georgia, 'Times New Roman', Times, serif;
  font-size: 42px;
  font-weight: 400;
  color: var(--text);
  margin: 0 0 24px;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.custom-section-content {
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.8;
  max-width: 700px;
  white-space: pre-wrap;
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
