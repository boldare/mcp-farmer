import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type { Schema } from "../shared/schema.js";

export interface Finding {
  severity: "error" | "warning" | "info";
  message: string;
  toolName?: string;
  inputName?: string;
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

export function checkInputDescriptions(tool: Tool): Finding[] {
  const schema = tool.inputSchema as Schema | undefined;
  const properties = schema?.properties ?? {};
  const findings: Finding[] = [];

  for (const [inputName, prop] of Object.entries(properties)) {
    if (!prop.description) {
      findings.push({
        severity: "warning",
        message: "Missing input description",
        toolName: tool.name,
        inputName,
      });
    }
  }

  return findings;
}

const MAX_REQUIRED_INPUTS = 5;
const MAX_TOOLS = 30;
const SIMILARITY_THRESHOLD = 0.7;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "it",
  "this",
  "that",
  "which",
  "can",
  "will",
  "do",
  "does",
  "did",
  "has",
  "have",
  "had",
  "if",
  "then",
  "than",
  "so",
  "just",
  "also",
  "into",
  "its",
]);

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
  "remove",
  "delete",
] as const;

const PII_WORDS = [
  // Personal identifiers
  "email",
  "phone",
  "address",
  "ssn",
  "passport",
  "license",
  // Names
  "firstname",
  "lastname",
  "fullname",
  "username",
  // Financial
  "credit",
  "card",
  "bank",
  // Health
  "health",
  "medical",
  "diagnosis",
  "patient",
  // Biometric
  "fingerprint",
  "biometric",
  "face",
  "retina",
  // Location
  "location",
  "gps",
  "coordinates",
  // Authentication
  "password",
  "secret",
  "credential",
  // Demographics
  "dob",
  "birthday",
  "birthdate",
  "age",
  "gender",
  "race",
  "ethnicity",
  // IDs
  "identifier",
  "national",
  "social",
  "tax",
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

function tokenizeDescription(description: string): Set<string> {
  const words = description
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));

  return new Set(words);
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
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

export function checkPiiHandling(tool: Tool): Finding | null {
  const nameTokens = tokenize(tool.name);
  const descriptionTokens = tool.description ? tokenize(tool.description) : [];

  const schema = tool.inputSchema as Schema | undefined;
  const inputNames = Object.keys(schema?.properties ?? {});
  const inputTokens = inputNames.flatMap(tokenize);

  const allTokens = [...nameTokens, ...descriptionTokens, ...inputTokens];

  const matchedTokens = allTokens.filter((token) =>
    PII_WORDS.includes(token as (typeof PII_WORDS)[number]),
  );

  if (matchedTokens.length > 0) {
    const uniqueMatches = [...new Set(matchedTokens)];
    return {
      severity: "info",
      message: `May handle personal data (contains: ${uniqueMatches.join(", ")})`,
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

export function checkOutputSchema(
  tool: Tool & { outputSchema?: Schema },
): Finding | null {
  if (!tool.outputSchema) {
    return {
      severity: "info",
      message: "Missing output schema",
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

export function checkTotalToolCount(tools: Tool[]): Finding | null {
  if (tools.length > MAX_TOOLS) {
    return {
      severity: "warning",
      message: `Server exposes ${tools.length} tools. Consider reducing to ${MAX_TOOLS} or fewer for better LLM accuracy`,
    };
  }

  return null;
}

const MIN_TOKENS_FOR_COMPARISON = 3;

export function checkSimilarDescriptions(tools: Tool[]): Finding[] {
  const findings: Finding[] = [];

  const tokenized = tools
    .filter((tool) => tool.description)
    .map((tool) => ({
      name: tool.name,
      tokens: tokenizeDescription(tool.description ?? ""),
    }))
    .filter((t) => t.tokens.size >= MIN_TOKENS_FOR_COMPARISON);

  for (let i = 0; i < tokenized.length; i++) {
    const toolA = tokenized[i];
    for (let j = i + 1; j < tokenized.length; j++) {
      const toolB = tokenized[j];
      if (!toolA || !toolB) continue;

      const similarity = jaccardSimilarity(toolA.tokens, toolB.tokens);

      if (similarity >= SIMILARITY_THRESHOLD) {
        const percentage = Math.round(similarity * 100);
        findings.push({
          severity: "warning",
          message: `Similar descriptions detected (${percentage}% overlap). Consider making descriptions more distinct to help LLMs differentiate between tools`,
          toolName: `${toolA.name}, ${toolB.name}`,
        });
      }
    }
  }

  return findings;
}

export function runCheckers(tools: Tool[]): Finding[] {
  const perToolFindings = tools
    .flatMap((tool) => [
      checkToolDescriptions(tool),
      ...checkInputDescriptions(tool),
      checkInputCount(tool),
      checkDangerousTools(tool),
      checkOutputSchema(tool as Tool & { outputSchema?: Schema }),
      checkPiiHandling(tool),
    ])
    .filter((f): f is Finding => f !== null);

  const serverFindings = [
    checkDuplicateToolNames(tools),
    checkTotalToolCount(tools),
    checkSimilarDescriptions(tools),
  ]
    .flat()
    .filter((f): f is Finding => f !== null);

  return [...serverFindings, ...perToolFindings];
}
