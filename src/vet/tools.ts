import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface Finding {
  severity: "error" | "warning";
  message: string;
  toolName?: string;
  inputName?: string;
}

export interface SchemaProperty {
  type?: string | string[];
  description?: string;
  anyOf?: Array<{ type: string; items?: { type: string } }>;
  items?: { type: string };
  additionalProperties?: { type: string };
}

export interface Schema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

export function checkToolDescriptions(tool: Tool): Finding | null {
  if (!tool.description) {
    return {
      severity: "warning",
      message: "Missing tool description",
      toolName: tool.name,
    };
  }

  return null;
}

export function checkInputDescriptions(tool: Tool): Finding | null {
  const schema = tool.inputSchema as Schema | undefined;
  const properties = schema?.properties ?? {};

  for (const [inputName, prop] of Object.entries(properties)) {
    if (!prop.description) {
      return {
        severity: "warning",
        message: "Missing input description",
        toolName: tool.name,
        inputName,
      };
    }
  }

  return null;
}

const MAX_REQUIRED_INPUTS = 5;

const DANGEROUS_WORDS = [
  // File system destruction
  "rm",
  "unlink",
  // Code execution
  "exec",
  "eval",
  "shell",
  "bash",
  // Database destruction
  "drop",
  "truncate",
  // Privileged access
  "sudo",
  "root",
  // Process/system control
  "kill",
  "terminate",
  // Destructive operations
  "destroy",
  "wipe",
  "purge",
  "erase",
] as const;

/**
 * Tokenizes a name into an array of words.
 * @param name camelCase, PascalCase, snake_case, kebab-case, etc.
 * @returns tokenized array of words
 */
export function tokenize(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // XMLParser → XML Parser
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);
}

export function checkDangerousTools(tool: Tool): Finding | null {
  const tokens = tokenize(tool.name);
  const matched = tokens.find((token) =>
    DANGEROUS_WORDS.includes(token as (typeof DANGEROUS_WORDS)[number]),
  );

  if (matched) {
    return {
      severity: "warning",
      message: `Potentially dangerous tool detected (contains "${matched}")`,
      toolName: tool.name,
    };
  }

  return null;
}

export function checkInputCount(tool: Tool): Finding | null {
  const schema = tool.inputSchema as Schema | undefined;
  const requiredInputs = schema?.required ?? [];

  if (requiredInputs.length > MAX_REQUIRED_INPUTS) {
    return {
      severity: "warning",
      message: `Too many required inputs (${requiredInputs.length}). Consider reducing to ${MAX_REQUIRED_INPUTS} or fewer for better LLM accuracy`,
      toolName: tool.name,
    };
  }

  return null;
}

export function checkDuplicateToolNames(tools: Tool[]): Finding[] {
  const seen = new Map<string, number>();

  for (const tool of tools) {
    seen.set(tool.name, (seen.get(tool.name) ?? 0) + 1);
  }

  const findings: Finding[] = [];
  for (const [name, count] of seen) {
    if (count > 1) {
      findings.push({
        severity: "error",
        message: `Duplicate tool name (appears ${count} times)`,
        toolName: name,
      });
    }
  }

  return findings;
}

export function runCheckers(tools: Tool[]): Finding[] {
  const perToolFindings = tools
    .flatMap((tool) => [
      checkToolDescriptions(tool),
      checkInputDescriptions(tool),
      checkInputCount(tool),
      checkDangerousTools(tool),
    ])
    .filter((f): f is Finding => f !== null);

  const duplicateFindings = checkDuplicateToolNames(tools);

  return [...duplicateFindings, ...perToolFindings];
}
