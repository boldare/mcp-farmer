import { describe, test, expect } from "bun:test";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import {
  checkInputDescriptions,
  checkToolDescriptions,
  checkInputCount,
  checkDuplicateToolNames,
  checkTotalToolCount,
  checkDangerousTools,
  checkSimilarDescriptions,
  checkOutputSchema,
  checkPiiHandling,
  checkToolAnnotations,
  tokenize,
  runCheckers,
} from "./tools.js";
import type { Schema } from "../shared/schema.js";

function createTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: "test-tool",
    description: "Test description",
    ...overrides,
  } as Tool;
}

describe("checkToolDescriptions", () => {
  test("returns warning when tool has no description", () => {
    const tool = createTool({ name: "my-tool", description: undefined });

    const findings = checkToolDescriptions(tool);

    expect(findings).toEqual([
      {
        ruleId: "missing-tool-description",
        severity: "warning",
        message: "Missing tool description",
        toolName: "my-tool",
      },
    ]);
  });

  test("returns no finding when tool has description", () => {
    const tool = createTool({
      name: "my-tool",
      description: "Does something useful",
    });

    const findings = checkToolDescriptions(tool);

    expect(findings).toEqual([]);
  });
});

describe("checkInputDescriptions", () => {
  test("returns warning when input property has no description", () => {
    const tool = createTool({
      name: "my-tool",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
      },
    });

    const findings = checkInputDescriptions(tool);

    expect(findings).toEqual([
      {
        ruleId: "missing-input-description",
        severity: "warning",
        message: "Missing input description",
        toolName: "my-tool",
        inputName: "query",
      },
    ]);
  });

  test("returns warnings for all inputs missing descriptions", () => {
    const tool = createTool({
      name: "my-tool",
      inputSchema: {
        type: "object",
        properties: {
          package: { type: "string" },
          version: { type: "string" },
          ecosystem: { type: "string" },
        },
      },
    });

    const findings = checkInputDescriptions(tool);

    expect(findings).toHaveLength(3);
    expect(findings).toContainEqual({
      ruleId: "missing-input-description",
      severity: "warning",
      message: "Missing input description",
      toolName: "my-tool",
      inputName: "package",
    });
    expect(findings).toContainEqual({
      ruleId: "missing-input-description",
      severity: "warning",
      message: "Missing input description",
      toolName: "my-tool",
      inputName: "version",
    });
    expect(findings).toContainEqual({
      ruleId: "missing-input-description",
      severity: "warning",
      message: "Missing input description",
      toolName: "my-tool",
      inputName: "ecosystem",
    });
  });

  test("returns no finding when input property has description", () => {
    const tool = createTool({
      name: "my-tool",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The query to search for" },
        },
      },
    });

    const findings = checkInputDescriptions(tool);

    expect(findings).toEqual([]);
  });
});

describe("checkInputCount", () => {
  test("returns warning when tool has more than 5 required inputs", () => {
    const tool = createTool({
      name: "complex-tool",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "string" },
          c: { type: "string" },
          d: { type: "string" },
          e: { type: "string" },
          f: { type: "string" },
        },
        required: ["a", "b", "c", "d", "e", "f"],
      },
    });

    const finding = checkInputCount(tool);

    expect(finding).toEqual([
      {
        ruleId: "too-many-inputs",
        severity: "warning",
        message:
          "Too many required inputs (6). Consider reducing to 5 or fewer for better LLM accuracy",
        toolName: "complex-tool",
      },
    ]);
  });

  test("returns no finding when tool has 5 or fewer required inputs", () => {
    const tool = createTool({
      name: "simple-tool",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "string" },
        },
        required: ["a", "b"],
      },
    });

    const finding = checkInputCount(tool);

    expect(finding).toEqual([]);
  });

  test("returns no finding when tool has no required inputs", () => {
    const tool = createTool({
      name: "optional-tool",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "string" },
        },
      },
    });

    const finding = checkInputCount(tool);

    expect(finding).toEqual([]);
  });
});

describe("checkDuplicateToolNames", () => {
  test("returns error when tools have duplicate names", () => {
    const tools = [
      createTool({ name: "search", description: "Search something" }),
      createTool({ name: "fetch", description: "Fetch data" }),
      createTool({ name: "search", description: "Another search" }),
    ];

    const findings = checkDuplicateToolNames(tools);

    expect(findings).toEqual([
      {
        ruleId: "duplicate-tool-name",
        severity: "error",
        message: "Duplicate tool name (appears 2 times)",
        toolName: "search",
      },
    ]);
  });

  test("returns multiple errors for multiple duplicates", () => {
    const tools = [
      createTool({ name: "search", description: "Search 1" }),
      createTool({ name: "fetch", description: "Fetch 1" }),
      createTool({ name: "search", description: "Search 2" }),
      createTool({ name: "fetch", description: "Fetch 2" }),
      createTool({ name: "fetch", description: "Fetch 3" }),
    ];

    const findings = checkDuplicateToolNames(tools);

    expect(findings).toHaveLength(2);
    expect(findings).toContainEqual({
      ruleId: "duplicate-tool-name",
      severity: "error",
      message: "Duplicate tool name (appears 2 times)",
      toolName: "search",
    });
    expect(findings).toContainEqual({
      ruleId: "duplicate-tool-name",
      severity: "error",
      message: "Duplicate tool name (appears 3 times)",
      toolName: "fetch",
    });
  });

  test("returns no findings when all tool names are unique", () => {
    const tools = [
      createTool({ name: "search", description: "Search" }),
      createTool({ name: "fetch", description: "Fetch" }),
      createTool({ name: "list", description: "List" }),
    ];

    const findings = checkDuplicateToolNames(tools);

    expect(findings).toEqual([]);
  });

  test("returns no findings for empty tool list", () => {
    const findings = checkDuplicateToolNames([]);

    expect(findings).toEqual([]);
  });
});

describe("checkTotalToolCount", () => {
  function createTools(count: number): Tool[] {
    return Array.from({ length: count }, (_, i) =>
      createTool({ name: `tool-${i}`, description: `Tool ${i}` }),
    );
  }

  test("returns warning when server has more than 30 tools", () => {
    const tools = createTools(31);
    const finding = checkTotalToolCount(tools);

    expect(finding).toEqual([
      {
        ruleId: "too-many-tools",
        severity: "warning",
        message:
          "Server exposes 31 tools. Consider reducing to 30 or fewer for better LLM accuracy",
      },
    ]);
  });

  test("returns no finding when server has exactly 30 tools", () => {
    const tools = createTools(30);

    const finding = checkTotalToolCount(tools);

    expect(finding).toEqual([]);
  });

  test("returns no finding when server has fewer than 30 tools", () => {
    const tools = createTools(12);

    const finding = checkTotalToolCount(tools);

    expect(finding).toEqual([]);
  });

  test("returns no finding for empty tool list", () => {
    const finding = checkTotalToolCount([]);

    expect(finding).toEqual([]);
  });
});

describe("tokenize", () => {
  test.each([
    ["deleteFile", ["delete", "file"]],
    ["DeleteFile", ["delete", "file"]],
    ["delete_file", ["delete", "file"]],
    ["delete-file", ["delete", "file"]],
    ["DELETE_FILE", ["delete", "file"]],
    ["XMLParser", ["xml", "parser"]],
    ["runSQLQuery", ["run", "sql", "query"]],
    ["exec_shell-Command", ["exec", "shell", "command"]],
  ])("tokenizes %s", (name, expected) => {
    expect(tokenize(name)).toEqual(expected);
  });
});

describe("checkDangerousTools", () => {
  test.each([
    ["rmFile", "rm"],
    ["execCommand", "exec"],
    ["shell_runner", "shell"],
    ["bashExec", "bash"],
    ["evalCode", "eval"],
    ["dropTable", "drop"],
    ["truncate_logs", "truncate"],
    ["sudoRun", "sudo"],
    ["rootAccess", "root"],
    ["killProcess", "kill"],
    ["terminateSession", "terminate"],
    ["destroyData", "destroy"],
    ["wipeStorage", "wipe"],
    ["purgeCache", "purge"],
    ["eraseAll", "erase"],
    ["unlinkFile", "unlink"],
  ])("detects %s as dangerous (contains %s)", (toolName, expectedWord) => {
    const tool = createTool({ name: toolName });

    const finding = checkDangerousTools(tool);

    expect(finding).toEqual([
      {
        ruleId: "dangerous-tool",
        severity: "warning",
        message: `Potentially dangerous tool detected (contains "${expectedWord}")`,
        toolName,
      },
    ]);
  });

  test.each([
    "search",
    "getData",
    "list_files",
    "read-content",
    "formatter",
    "runQuery",
    "writeLog",
    "executeTask",
    "commandParser",
  ])("returns no finding for safe tool: %s", (toolName) => {
    const tool = createTool({ name: toolName });

    expect(checkDangerousTools(tool)).toEqual([]);
  });
});

describe("checkSimilarDescriptions", () => {
  test.each<{ name: string; tools: Tool[]; expectFindings: boolean }>([
    {
      name: "detects similar descriptions",
      tools: [
        createTool({
          name: "searchUsers",
          description: "Search for users in the database by name or email",
        }),
        createTool({
          name: "findUsers",
          description:
            "Search for users in the database by name or email address",
        }),
      ],
      expectFindings: true,
    },
    {
      name: "ignores distinct descriptions",
      tools: [
        createTool({
          name: "searchUsers",
          description: "Search for users in the database by name or email",
        }),
        createTool({
          name: "createReport",
          description: "Generate a PDF report with analytics data and charts",
        }),
      ],
      expectFindings: false,
    },
    {
      name: "ignores short descriptions",
      tools: [
        createTool({ name: "tool1", description: "Do it" }),
        createTool({ name: "tool2", description: "Do it" }),
      ],
      expectFindings: false,
    },
    {
      name: "ignores tools without descriptions",
      tools: [
        createTool({ name: "tool1", description: undefined }),
        createTool({ name: "tool2", description: undefined }),
      ],
      expectFindings: false,
    },
  ])("$name", ({ tools, expectFindings }) => {
    const findings = checkSimilarDescriptions(tools);

    if (expectFindings) {
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0]?.message).toContain("Similar descriptions detected");
    } else {
      expect(findings).toEqual([]);
    }
  });
});

describe("checkOutputSchema", () => {
  test("returns info when tool has no output schema", () => {
    const tool = createTool({ name: "my-tool" });

    const finding = checkOutputSchema(tool);

    expect(finding).toEqual([
      {
        ruleId: "missing-output-schema",
        severity: "info",
        message: "Missing output schema",
        toolName: "my-tool",
      },
    ]);
  });

  test("returns no finding when tool has output schema", () => {
    const tool = createTool({
      name: "my-tool",
      inputSchema: { type: "object" },
    }) as Tool & { outputSchema: Schema };
    tool.outputSchema = {
      type: "object",
      properties: {
        result: { type: "string" },
      },
    };

    const finding = checkOutputSchema(tool);

    expect(finding).toEqual([]);
  });
});

describe("checkToolAnnotations", () => {
  test("returns info when tool has no annotations", () => {
    const tool = createTool({ name: "my-tool" });

    const finding = checkToolAnnotations(tool);

    expect(finding).toEqual([
      {
        ruleId: "missing-tool-annotations",
        severity: "info",
        message:
          "Missing tool annotations (readOnlyHint, idempotentHint, openWorldHint, destructiveHint)",
        toolName: "my-tool",
      },
    ]);
  });

  test("returns no finding when tool has annotations", () => {
    const tool = createTool({
      name: "my-tool",
      annotations: { readOnlyHint: true },
    });

    const finding = checkToolAnnotations(tool);

    expect(finding).toEqual([]);
  });

  test("returns no finding when tool has empty annotations object", () => {
    const tool = createTool({ name: "my-tool", annotations: {} });

    const finding = checkToolAnnotations(tool);

    expect(finding).toEqual([]);
  });
});

describe("checkPiiHandling", () => {
  test.each([
    ["getUserEmail", "email"],
    ["updatePhoneNumber", "phone"],
    ["getAddress", "address"],
    ["validateSsn", "ssn"],
    ["storePassword", "password"],
    ["fetchFirstname", "firstname"],
    ["processCreditCard", "credit"],
    ["getPatientData", "patient"],
    ["updateBirthday", "birthday"],
    ["getUserLocation", "location"],
  ])("detects PII in tool name: %s (contains %s)", (toolName, expectedWord) => {
    const tool = createTool({ name: toolName });

    const finding = checkPiiHandling(tool);

    expect(finding).not.toEqual([]);
    expect(finding[0]?.ruleId).toBe("pii-handling");
    expect(finding[0]?.severity).toBe("info");
    expect(finding[0]?.message).toContain("May handle personal data");
    expect(finding[0]?.message).toContain(expectedWord);
  });

  test("detects PII in tool description", () => {
    const tool = createTool({
      name: "fetchData",
      description: "Fetches user email and phone from the database",
    });

    const finding = checkPiiHandling(tool);

    expect(finding).not.toEqual([]);
    expect(finding[0]?.message).toContain("email");
    expect(finding[0]?.message).toContain("phone");
  });

  test("detects PII in input property names", () => {
    const tool = createTool({
      name: "updateUser",
      description: "Updates user information",
      inputSchema: {
        type: "object",
        properties: {
          emailAddress: { type: "string", description: "Email" },
          phoneNumber: { type: "string", description: "Phone" },
          userPassword: { type: "string", description: "Password" },
        },
      },
    });

    const finding = checkPiiHandling(tool);

    expect(finding).not.toEqual([]);
    expect(finding[0]?.message).toContain("email");
    expect(finding[0]?.message).toContain("phone");
    expect(finding[0]?.message).toContain("password");
  });

  test("returns unique PII matches only", () => {
    const tool = createTool({
      name: "emailService",
      description: "Send email notifications",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string" },
        },
      },
    });

    const finding = checkPiiHandling(tool);

    expect(finding).not.toEqual([]);
    const emailCount = (finding[0]?.message.match(/email/g) || []).length;
    expect(emailCount).toBe(1);
  });

  test.each([
    "search",
    "formatText",
    "list_files",
    "calculate-total",
    "runQuery",
  ])("returns no finding for safe tool: %s", (toolName) => {
    const tool = createTool({
      name: toolName,
      description: "A safe tool",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
      },
    });

    expect(checkPiiHandling(tool)).toEqual([]);
  });
});

describe("runCheckers", () => {
  test("aggregates findings from per-tool and server-level checkers", () => {
    const tool1 = createTool({
      name: "deleteUserEmail", // triggers: dangerous-tool, pii-handling
      description: "Delete user email from the database", // similar to tool2
      // no annotations -> triggers: missing-tool-annotations
      // no outputSchema -> triggers: missing-output-schema
      inputSchema: {
        type: "object",
        properties: {
          userId: { type: "string" }, // triggers: missing-input-description
        },
      },
    });

    const tool2 = createTool({
      name: "deleteUserEmail", // triggers: duplicate-tool-name
      description: "Delete user email address from database", // triggers: similar-descriptions
    });

    const findings = runCheckers([tool1, tool2]);
    const ruleIds = findings.map((f) => f.ruleId);

    // Server-level checks
    expect(ruleIds).toContain("duplicate-tool-name");
    expect(ruleIds).toContain("similar-descriptions");

    // Per-tool checks
    expect(ruleIds).toContain("dangerous-tool");
    expect(ruleIds).toContain("pii-handling");
    expect(ruleIds).toContain("missing-input-description");
    expect(ruleIds).toContain("missing-output-schema");
    expect(ruleIds).toContain("missing-tool-annotations");
  });
});
