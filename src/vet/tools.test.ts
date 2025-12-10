import { describe, test, expect } from "bun:test";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import {
  checkInputDescriptions,
  checkToolDescriptions,
  checkInputCount,
  checkDuplicateToolNames,
  checkDangerousTools,
  tokenize,
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

    expect(findings).toEqual({
      severity: "warning",
      message: "Missing input description",
      toolName: "my-tool",
      inputName: "query",
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

    expect(findings).toBeNull();
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
    "deleteItem",
    "removeFromCart",
    "executeTask",
    "commandParser",
  ])("returns no finding for safe tool: %s", (toolName) => {
    const tool = { name: toolName, description: "Test" } as Tool;

    expect(checkDangerousTools(tool)).toBeNull();
  });
});
