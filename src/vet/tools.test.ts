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
  tokenize,
  type Schema,
} from "./tools.js";

describe("checkToolDescriptions", () => {
  test("returns warning when tool has no description", () => {
    const tool = { name: "my-tool" } as Tool;

    const findings = checkToolDescriptions(tool);

    expect(findings).toEqual({
      severity: "warning",
      message: "Missing tool description",
      toolName: "my-tool",
    });
  });

  test("returns no finding when tool has description", () => {
    const tool = {
      name: "my-tool",
      description: "Does something useful",
    } as Tool;

    const findings = checkToolDescriptions(tool);

    expect(findings).toBeNull();
  });
});

describe("checkInputDescriptions", () => {
  test("returns warning when input property has no description", () => {
    const tool = {
      name: "my-tool",
      description: "A tool",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
      },
    } as Tool;

    const findings = checkInputDescriptions(tool);

    expect(findings).toEqual([
      {
        severity: "warning",
        message: "Missing input description",
        toolName: "my-tool",
        inputName: "query",
      },
    ]);
  });

  test("returns warnings for all inputs missing descriptions", () => {
    const tool = {
      name: "my-tool",
      description: "A tool",
      inputSchema: {
        type: "object",
        properties: {
          package: { type: "string" },
          version: { type: "string" },
          ecosystem: { type: "string" },
        },
      },
    } as Tool;

    const findings = checkInputDescriptions(tool);

    expect(findings).toHaveLength(3);
    expect(findings).toContainEqual({
      severity: "warning",
      message: "Missing input description",
      toolName: "my-tool",
      inputName: "package",
    });
    expect(findings).toContainEqual({
      severity: "warning",
      message: "Missing input description",
      toolName: "my-tool",
      inputName: "version",
    });
    expect(findings).toContainEqual({
      severity: "warning",
      message: "Missing input description",
      toolName: "my-tool",
      inputName: "ecosystem",
    });
  });

  test("returns no finding when input property has description", () => {
    const tool = {
      name: "my-tool",
      description: "A tool",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The query to search for" },
        },
      },
    } as Tool;

    const findings = checkInputDescriptions(tool);

    expect(findings).toEqual([]);
  });
});

describe("checkInputCount", () => {
  test("returns warning when tool has more than 5 required inputs", () => {
    const tool = {
      name: "complex-tool",
      description: "A tool with many inputs",
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
    } as Tool;

    const finding = checkInputCount(tool);

    expect(finding).toEqual({
      severity: "warning",
      message:
        "Too many required inputs (6). Consider reducing to 5 or fewer for better LLM accuracy",
      toolName: "complex-tool",
    });
  });

  test("returns no finding when tool has 5 or fewer required inputs", () => {
    const tool = {
      name: "simple-tool",
      description: "A simple tool",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "string" },
        },
        required: ["a", "b"],
      },
    } as Tool;

    const finding = checkInputCount(tool);

    expect(finding).toBeNull();
  });

  test("returns no finding when tool has no required inputs", () => {
    const tool = {
      name: "optional-tool",
      description: "A tool with optional inputs only",
      inputSchema: {
        type: "object",
        properties: {
          a: { type: "string" },
        },
      },
    } as Tool;

    const finding = checkInputCount(tool);

    expect(finding).toBeNull();
  });
});

describe("checkDuplicateToolNames", () => {
  test("returns error when tools have duplicate names", () => {
    const tools = [
      { name: "search", description: "Search something" },
      { name: "fetch", description: "Fetch data" },
      { name: "search", description: "Another search" },
    ] as Tool[];

    const findings = checkDuplicateToolNames(tools);

    expect(findings).toEqual([
      {
        severity: "error",
        message: "Duplicate tool name (appears 2 times)",
        toolName: "search",
      },
    ]);
  });

  test("returns multiple errors for multiple duplicates", () => {
    const tools = [
      { name: "search", description: "Search 1" },
      { name: "fetch", description: "Fetch 1" },
      { name: "search", description: "Search 2" },
      { name: "fetch", description: "Fetch 2" },
      { name: "fetch", description: "Fetch 3" },
    ] as Tool[];

    const findings = checkDuplicateToolNames(tools);

    expect(findings).toHaveLength(2);
    expect(findings).toContainEqual({
      severity: "error",
      message: "Duplicate tool name (appears 2 times)",
      toolName: "search",
    });
    expect(findings).toContainEqual({
      severity: "error",
      message: "Duplicate tool name (appears 3 times)",
      toolName: "fetch",
    });
  });

  test("returns no findings when all tool names are unique", () => {
    const tools = [
      { name: "search", description: "Search" },
      { name: "fetch", description: "Fetch" },
      { name: "list", description: "List" },
    ] as Tool[];

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
    return Array.from({ length: count }, (_, i) => ({
      name: `tool-${i}`,
      description: `Tool ${i}`,
    })) as Tool[];
  }

  test("returns warning when server has more than 30 tools", () => {
    const tools = createTools(31);
    const finding = checkTotalToolCount(tools);

    expect(finding).toEqual({
      severity: "warning",
      message:
        "Server exposes 31 tools. Consider reducing to 30 or fewer for better LLM accuracy",
    });
  });

  test("returns no finding when server has exactly 30 tools", () => {
    const tools = createTools(30);

    const finding = checkTotalToolCount(tools);

    expect(finding).toBeNull();
  });

  test("returns no finding when server has fewer than 30 tools", () => {
    const tools = createTools(12);

    const finding = checkTotalToolCount(tools);

    expect(finding).toBeNull();
  });

  test("returns no finding for empty tool list", () => {
    const finding = checkTotalToolCount([]);

    expect(finding).toBeNull();
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
    const tool = { name: toolName, description: "Test" } as Tool;

    const finding = checkDangerousTools(tool);

    expect(finding).toEqual({
      severity: "warning",
      message: `Potentially dangerous tool detected (contains "${expectedWord}")`,
      toolName,
    });
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
    const tool = { name: toolName, description: "Test" } as Tool;

    expect(checkDangerousTools(tool)).toBeNull();
  });
});

describe("checkSimilarDescriptions", () => {
  test.each<{ name: string; tools: Tool[]; expectFindings: boolean }>([
    {
      name: "detects similar descriptions",
      tools: [
        {
          name: "searchUsers",
          description: "Search for users in the database by name or email",
        },
        {
          name: "findUsers",
          description:
            "Search for users in the database by name or email address",
        },
      ] as Tool[],
      expectFindings: true,
    },
    {
      name: "ignores distinct descriptions",
      tools: [
        {
          name: "searchUsers",
          description: "Search for users in the database by name or email",
        },
        {
          name: "createReport",
          description: "Generate a PDF report with analytics data and charts",
        },
      ] as Tool[],
      expectFindings: false,
    },
    {
      name: "ignores short descriptions",
      tools: [
        { name: "tool1", description: "Do it" },
        { name: "tool2", description: "Do it" },
      ] as Tool[],
      expectFindings: false,
    },
    {
      name: "ignores tools without descriptions",
      tools: [{ name: "tool1" }, { name: "tool2" }] as Tool[],
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
    const tool = { name: "my-tool", description: "Test" } as Tool;

    const finding = checkOutputSchema(tool);

    expect(finding).toEqual({
      severity: "info",
      message: "Missing output schema",
      toolName: "my-tool",
    });
  });

  test("returns no finding when tool has output schema", () => {
    const tool = {
      name: "my-tool",
      description: "Test",
      inputSchema: { type: "object" },
      outputSchema: {
        type: "object",
        properties: {
          result: { type: "string" },
        },
      },
    } as Tool & { outputSchema: Schema };

    const finding = checkOutputSchema(tool);

    expect(finding).toBeNull();
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
    const tool = { name: toolName, description: "Test" } as Tool;

    const finding = checkPiiHandling(tool);

    expect(finding).not.toBeNull();
    expect(finding?.severity).toBe("info");
    expect(finding?.message).toContain("May handle personal data");
    expect(finding?.message).toContain(expectedWord);
  });

  test("detects PII in tool description", () => {
    const tool = {
      name: "fetchData",
      description: "Fetches user email and phone from the database",
    } as Tool;

    const finding = checkPiiHandling(tool);

    expect(finding).not.toBeNull();
    expect(finding?.message).toContain("email");
    expect(finding?.message).toContain("phone");
  });

  test("detects PII in input property names", () => {
    const tool = {
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
    } as Tool;

    const finding = checkPiiHandling(tool);

    expect(finding).not.toBeNull();
    expect(finding?.message).toContain("email");
    expect(finding?.message).toContain("phone");
    expect(finding?.message).toContain("password");
  });

  test("returns unique PII matches only", () => {
    const tool = {
      name: "emailService",
      description: "Send email notifications",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string" },
        },
      },
    } as Tool;

    const finding = checkPiiHandling(tool);

    expect(finding).not.toBeNull();
    const emailCount = (finding?.message.match(/email/g) || []).length;
    expect(emailCount).toBe(1);
  });

  test.each([
    "search",
    "formatText",
    "list_files",
    "calculate-total",
    "runQuery",
  ])("returns no finding for safe tool: %s", (toolName) => {
    const tool = {
      name: toolName,
      description: "A safe tool",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
      },
    } as Tool;

    expect(checkPiiHandling(tool)).toBeNull();
  });
});
