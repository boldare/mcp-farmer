interface McpServer {
  name: string;
  description: string;
  package?: string;
  url?: string;
}

export const servers: McpServer[] = [
  {
    name: "Chrome DevTools",
    description:
      "Chrome DevTools integration for browser debugging and inspection",
    package: "chrome-devtools-mcp@latest",
  },
  {
    name: "Playwright",
    description: "Browser automation for web testing and scraping",
    package: "@playwright/mcp",
  },
  {
    name: "Atlassian",
    description: "Atlassian integration for Jira, Confluence, and more",
    url: "https://mcp.atlassian.com/v1/sse",
  },
  {
    name: "Linear",
    description: "Linear integration for issue tracking and project management",
    url: "https://mcp.linear.app/mcp",
  },
  {
    name: "Context7",
    description: "Context7",
    url: "https://mcp.context7.com/mcp",
  },
  {
    name: "Figma",
    description: "Figma integration for design and collaboration",
    url: "https://mcp.figma.com/mcp",
  },
];
