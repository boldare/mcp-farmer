/**
 * Prompts for MCP tool generation from API specifications.
 *
 * Follows context engineering best practices:
 * - Minimal, high-signal context (Anthropic: "smallest possible set of high-signal tokens")
 * - Structured sections with clear delineation (XML tags)
 * - Canonical examples over exhaustive rules
 * - Explicit constraints and output expectations
 *
 * @see https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
 * @see https://ai.google.dev/gemini-api/docs/prompting-strategies
 */

const SHARED_RULES = `
## Tool Naming

Use snake_case with a service prefix derived from the API name:
- Format: {service}_{action}_{resource}
- Examples: github_create_issue, stripe_list_customers, slack_send_message

## Tool Description Format

Every tool MUST have a comprehensive description following this structure:

\`\`\`
Brief one-line summary of what the tool does.

Args:
  - param_name (type): Description of parameter
  - another_param (type, optional): Description with default value

Returns:
  Description of the return value and its structure.
  For JSON format: { field: type, ... }

Examples:
  - "Find all active users" → { status: "active" }
  - "Get user by email" → { email: "user@example.com" }

Errors:
  - Returns "Error: Not found" if resource doesn't exist
  - Returns "Error: Rate limited" if too many requests
\`\`\`

## Zod Schema Requirements

1. Use \`.strict()\` on all object schemas to reject unknown properties
2. Every property MUST have \`.describe()\` with a clear, concise description
3. Add validation constraints: \`.min()\`, \`.max()\`, \`.email()\`, etc.
4. Use \`.default()\` for optional parameters with sensible defaults

Example:
\`\`\`typescript
const InputSchema = z.object({
  query: z.string()
    .min(1, "Query cannot be empty")
    .max(200, "Query too long")
    .describe("Search term to match against names"),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum results to return"),
}).strict();
\`\`\`

## Tool Annotations

Set ALL four annotations explicitly based on operation semantics:

| Operation Type | readOnlyHint | destructiveHint | idempotentHint | openWorldHint |
|----------------|--------------|-----------------|----------------|---------------|
| GET/Query      | true         | false           | true           | true          |
| POST/Create    | false        | false           | false          | true          |
| PUT/Update     | false        | false           | true           | true          |
| DELETE         | false        | true            | true           | true          |
| Mutation       | false        | varies*         | varies*        | true          |

*For mutations: destructiveHint=true if name contains "delete", "remove", "destroy"

## Response Pattern

Return both text content and structured data:

\`\`\`typescript
return {
  content: [{ type: "text", text: formattedOutput }],
  structuredContent: structuredData  // For programmatic access
};
\`\`\`

## Output Schema

Define \`outputSchema\` to enable strict validation of structured results.
When provided, the \`structuredContent\` MUST conform to this schema.

Benefits:
- Enables clients to validate responses
- Provides type information for better integration
- Guides LLMs to properly parse returned data
- Improves documentation and developer experience

Example:
\`\`\`typescript
server.registerTool(
  "api_get_weather",
  {
    title: "Get Weather",
    description: "Get current weather for a location",
    inputSchema: z.object({
      location: z.string().describe("City name or zip code")
    }).strict(),
    outputSchema: z.object({
      temperature: z.number().describe("Temperature in celsius"),
      conditions: z.string().describe("Weather conditions"),
      humidity: z.number().describe("Humidity percentage")
    }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
  },
  async ({ location }) => {
    const data = await fetchWeather(location);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data  // Must match outputSchema
    };
  }
);
\`\`\`

## Error Handling

Wrap API calls in try/catch and return actionable error messages:

\`\`\`typescript
try {
  const data = await apiRequest(...);
  return { content: [{ type: "text", text: formatResult(data) }] };
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    content: [{ type: "text", text: \`Error: \${message}. Check parameters and try again.\` }],
    isError: true
  };
}
\`\`\`
`.trim();

const SHARED_WORKFLOW = `
## Workflow

1. **Explore**: Read current directory to understand project structure and patterns
2. **Analyze**: Check for existing tools, naming conventions, and shared utilities
3. **Validate**: Confirm no duplicate tool names exist
4. **Generate**: Create tool(s) following existing patterns or best practices
5. **Register**: Register tool(s) with the server instance
6. **Verify**: Ensure generated code compiles and follows project style
`.trim();

const FILE_ORGANIZATION = `
## File Organization

- Place each tool in the \`tools/\` directory as a separate file
- If the project has a different pattern, follow it
- Each file should export a function that accepts the server instance
- Group related utilities in \`utils/\` or \`services/\` directories
`.trim();

export interface OpenAPIPromptParams {
  cwd: string;
  endpoints: string; // JSON stringified endpoints
}

export function buildOpenAPIPrompt(params: OpenAPIPromptParams): string {
  return `
<task>
Generate MCP tools from OpenAPI endpoints. Each endpoint becomes one tool.
</task>

<context>
Working directory: ${params.cwd}
API base URL: Read from API_BASE_URL environment variable
</context>

${SHARED_WORKFLOW}

${FILE_ORGANIZATION}

${SHARED_RULES}

## OpenAPI-Specific Rules

1. Use \`fetch\` for HTTP requests (or project's existing HTTP client)
2. Map HTTP methods to annotations:
   - GET → readOnlyHint: true, idempotentHint: true
   - POST → idempotentHint: false (creates new resources)
   - PUT → idempotentHint: true (full replacement)
   - PATCH → idempotentHint: false (partial update)
   - DELETE → destructiveHint: true, idempotentHint: true
3. Extract path parameters from URL template (e.g., /users/{id})
4. Include query parameters as optional inputs with defaults where sensible
5. Return only the selected response fields

<example>
For endpoint: GET /users/{id}

Generated tool:
\`\`\`typescript
server.registerTool(
  "api_get_user",
  {
    title: "Get User",
    description: \`Retrieve a user by their unique identifier.

Args:
  - id (string): The unique user identifier

Returns:
  User object with id, name, email, and created_at fields.

Examples:
  - Get user profile → { id: "usr_123" }

Errors:
  - Returns "Error: User not found" for invalid IDs\`,
    inputSchema: z.object({
      id: z.string().describe("The unique user identifier")
    }).strict(),
    outputSchema: z.object({
      id: z.string().describe("Unique user identifier"),
      name: z.string().describe("User's full name"),
      email: z.string().describe("User's email address"),
      created_at: z.string().describe("ISO 8601 timestamp of account creation")
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async ({ id }) => {
    try {
      const response = await fetch(\`\${API_BASE_URL}/users/\${id}\`);
      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
      }
      const user = await response.json();
      return {
        content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
        structuredContent: user
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: \`Error: \${error.message}\` }],
        isError: true
      };
    }
  }
);
\`\`\`
</example>

<endpoints>
${params.endpoints}
</endpoints>
`.trim();
}

export interface GraphQLPromptParams {
  cwd: string;
  operations: string; // JSON stringified operations
}

export function buildGraphQLPrompt(params: GraphQLPromptParams): string {
  return `
<task>
Generate MCP tools from GraphQL operations. Each query/mutation becomes one tool.
</task>

<context>
Working directory: ${params.cwd}
GraphQL endpoint: Read from GRAPHQL_ENDPOINT environment variable
</context>

${SHARED_WORKFLOW}

${FILE_ORGANIZATION}

${SHARED_RULES}

## GraphQL-Specific Rules

1. Use \`fetch\` with POST method for GraphQL requests
2. Set Content-Type: application/json header
3. Map operation types to annotations:
   - Query → readOnlyHint: true, idempotentHint: true
   - Mutation → readOnlyHint: false, idempotentHint: varies
   - Mutations with "delete", "remove", "destroy" → destructiveHint: true
4. Build GraphQL query string with only selected fields (selectedReturnFields)
5. Handle GraphQL errors (response.errors array)

<example>
For query: users(limit: Int): [User!]!

Generated tool:
\`\`\`typescript
server.registerTool(
  "api_list_users",
  {
    title: "List Users",
    description: \`Retrieve a paginated list of users.

Args:
  - limit (number, optional): Maximum users to return (default: 20, max: 100)

Returns:
  Object with users array and count.

Examples:
  - List first 10 users → { limit: 10 }
  - List with default limit → {}

Errors:
  - Returns "Error: GraphQL error" if query fails\`,
    inputSchema: z.object({
      limit: z.number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum users to return")
    }).strict(),
    outputSchema: z.object({
      users: z.array(z.object({
        id: z.string().describe("User ID"),
        name: z.string().describe("User's name"),
        email: z.string().describe("User's email")
      })).describe("List of users"),
      count: z.number().describe("Number of users returned")
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async ({ limit }) => {
    try {
      const query = \`
        query ListUsers($limit: Int) {
          users(limit: $limit) {
            id
            name
            email
          }
        }
      \`;
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { limit } })
      });
      const result = await response.json();
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }
      const users = result.data.users;
      return {
        content: [{ type: "text", text: JSON.stringify(users, null, 2) }],
        structuredContent: { users, count: users.length }
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: \`Error: \${error.message}\` }],
        isError: true
      };
    }
  }
);
\`\`\`
</example>

<operations>
${params.operations}
</operations>
`.trim();
}

export interface MarkdownPromptParams {
  cwd: string;
  tools: string; // JSON stringified tools
}

export function buildMarkdownPrompt(params: MarkdownPromptParams): string {
  return `
<task>
Generate MCP tools for browsing and reading markdown documentation.
Each selected tool capability becomes one MCP tool.
</task>

<context>
Working directory: ${params.cwd}
Documentation root: Read from DOCS_PATH environment variable at runtime
</context>

${SHARED_WORKFLOW}

${FILE_ORGANIZATION}

${SHARED_RULES}

## Markdown-Specific Rules

1. All file paths are relative to DOCS_PATH environment variable
2. Validate paths to prevent directory traversal attacks (reject paths containing "..")
3. Only read .md and .mdx files
4. Set a file size limit (e.g., 1MB) to prevent reading huge files
5. Use Node.js built-in modules only (fs/promises, path)
6. Handle errors gracefully with informative messages

<example>
For tool: docs_list_files

Generated tool:
\`\`\`typescript
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const DOCS_PATH = process.env.DOCS_PATH;
if (!DOCS_PATH) {
  throw new Error("DOCS_PATH environment variable is required");
}

interface MarkdownFile {
  path: string;
  name: string;
  size: number;
}

async function scanDirectory(dirPath: string): Promise<MarkdownFile[]> {
  const files: MarkdownFile[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      files.push(...await scanDirectory(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".md" || ext === ".mdx") {
        const stat = await fs.stat(fullPath);
        files.push({
          path: path.relative(DOCS_PATH, fullPath),
          name: path.basename(entry.name, ext),
          size: stat.size
        });
      }
    }
  }
  return files;
}

server.registerTool(
  "docs_list_files",
  {
    title: "List Documentation Files",
    description: \`List all markdown documentation files with metadata.

Args:
  - directory (string, optional): Subdirectory to list (default: root)

Returns:
  Array of file objects with path, name, and size.
  Example: [{ path: "getting-started.md", name: "getting-started", size: 2048 }]

Examples:
  - List all docs → {}
  - List guides folder → { directory: "guides" }

Errors:
  - Returns "Error: Directory not found" if path doesn't exist\`,
    inputSchema: z.object({
      directory: z.string()
        .optional()
        .describe("Subdirectory to list, relative to docs root")
    }).strict(),
    outputSchema: z.object({
      files: z.array(z.object({
        path: z.string().describe("Relative path to the file"),
        name: z.string().describe("File name without extension"),
        size: z.number().describe("File size in bytes")
      })).describe("List of markdown files"),
      count: z.number().describe("Total number of files")
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ directory }) => {
    try {
      const targetDir = directory 
        ? path.join(DOCS_PATH, directory)
        : DOCS_PATH;
      
      // Security: prevent directory traversal
      const resolved = path.resolve(targetDir);
      if (!resolved.startsWith(path.resolve(DOCS_PATH))) {
        throw new Error("Invalid directory path");
      }
      
      const files = await scanDirectory(resolved);
      const result = { files, count: files.length };
      
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: \`Error: \${error.message}\` }],
        isError: true
      };
    }
  }
);
\`\`\`
</example>

<example>
For tool: docs_read_file

Generated tool:
\`\`\`typescript
server.registerTool(
  "docs_read_file",
  {
    title: "Read Documentation File",
    description: \`Read the content of a markdown documentation file.

Args:
  - path (string): Relative path to the markdown file

Returns:
  The file content as text, with metadata.
  Example: { content: "# Title\\n\\nContent...", size: 1024 }

Examples:
  - Read README → { path: "README.md" }
  - Read nested file → { path: "guides/quickstart.md" }

Errors:
  - Returns "Error: File not found" if path doesn't exist
  - Returns "Error: File too large" if over 1MB\`,
    inputSchema: z.object({
      path: z.string()
        .min(1, "Path is required")
        .describe("Relative path to the markdown file")
    }).strict(),
    outputSchema: z.object({
      content: z.string().describe("File content"),
      path: z.string().describe("File path"),
      size: z.number().describe("File size in bytes")
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ path: filePath }) => {
    try {
      // Security: validate extension
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== ".md" && ext !== ".mdx") {
        throw new Error("Only .md and .mdx files are allowed");
      }
      
      const fullPath = path.join(DOCS_PATH, filePath);
      const resolved = path.resolve(fullPath);
      
      // Security: prevent directory traversal
      if (!resolved.startsWith(path.resolve(DOCS_PATH))) {
        throw new Error("Invalid file path");
      }
      
      const stat = await fs.stat(resolved);
      const MAX_SIZE = 1024 * 1024; // 1MB
      if (stat.size > MAX_SIZE) {
        throw new Error("File too large (max 1MB)");
      }
      
      const content = await fs.readFile(resolved, "utf8");
      const result = { content, path: filePath, size: stat.size };
      
      return {
        content: [{ type: "text", text: content }],
        structuredContent: result
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: \`Error: \${error.message}\` }],
        isError: true
      };
    }
  }
);
\`\`\`
</example>

<example>
For tool: docs_search

Generated tool:
\`\`\`typescript
server.registerTool(
  "docs_search",
  {
    title: "Search Documentation",
    description: \`Search for text across all markdown documentation files.

Args:
  - query (string): Text to search for (case-insensitive)
  - limit (number, optional): Maximum results to return (default: 20)

Returns:
  Array of matches with file path, line number, and matching line.
  Example: [{ path: "guide.md", line: 42, content: "...matching text..." }]

Examples:
  - Search for "installation" → { query: "installation" }
  - Search with limit → { query: "api", limit: 5 }

Errors:
  - Returns "Error: Query too short" if less than 2 characters\`,
    inputSchema: z.object({
      query: z.string()
        .min(2, "Query must be at least 2 characters")
        .max(100, "Query too long")
        .describe("Text to search for"),
      limit: z.number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum results to return")
    }).strict(),
    outputSchema: z.object({
      matches: z.array(z.object({
        path: z.string().describe("File path"),
        line: z.number().describe("Line number"),
        content: z.string().describe("Matching line content")
      })).describe("Search matches"),
      count: z.number().describe("Total matches found")
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async ({ query, limit }) => {
    try {
      const files = await scanDirectory(DOCS_PATH);
      const matches: { path: string; line: number; content: string }[] = [];
      const queryLower = query.toLowerCase();
      
      for (const file of files) {
        if (matches.length >= limit) break;
        
        const fullPath = path.join(DOCS_PATH, file.path);
        const content = await fs.readFile(fullPath, "utf8");
        const lines = content.split("\\n");
        
        for (let i = 0; i < lines.length && matches.length < limit; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            matches.push({
              path: file.path,
              line: i + 1,
              content: lines[i].trim().slice(0, 200)
            });
          }
        }
      }
      
      const result = { matches, count: matches.length };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: \`Error: \${error.message}\` }],
        isError: true
      };
    }
  }
);
\`\`\`
</example>

<tools>
${params.tools}
</tools>
`.trim();
}
