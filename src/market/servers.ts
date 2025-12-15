interface McpServer {
  name: string;
  description: string;
  package?: string;
  url?: string;
}

export const servers: McpServer[] = [
  {
    name: "Asana",
    description: "Asana integration for task and project management",
    url: "https://mcp.asana.com/sse",
  },
  {
    name: "Atlassian",
    description: "Atlassian integration for Jira, Confluence, and more",
    url: "https://mcp.atlassian.com/v1/sse",
  },
  {
    name: "Chrome DevTools",
    description:
      "Chrome DevTools integration for browser debugging and inspection",
    package: "chrome-devtools-mcp@latest",
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
  {
    name: "Grep",
    description: "Code search across repositories",
    url: "https://mcp.grep.app",
  },
  {
    name: "Linear",
    description: "Linear integration for issue tracking and project management",
    url: "https://mcp.linear.app/mcp",
  },
  {
    name: "Netlify",
    description: "Netlify integration for web deployment and hosting",
    url: "https://netlify-mcp.netlify.app/mcp",
  },
  {
    name: "Playwright",
    description: "Browser automation for web testing and scraping",
    package: "@playwright/mcp",
  },
  {
    name: "Sentry",
    description: "Sentry integration for error tracking and monitoring",
    url: "https://mcp.sentry.dev/mcp",
  },
  {
    name: "Vercel",
    description:
      "Vercel integration for web deployment and serverless functions",
    url: "https://mcp.vercel.com",
  },
];
