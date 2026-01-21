import { describe, expect, test } from "bun:test";

import { matchesTerm, parseInputValue, validateInputValue } from "./command.js";

describe("matchesTerm", () => {
  test("matches on name when description is missing", () => {
    const item = {
      type: "tool" as const,
      name: "CreateUser",
      tool: {} as never,
    };

    expect(matchesTerm(item, "create")).toBe(true);
    expect(matchesTerm(item, "missing")).toBe(false);
  });

  test("matches on description when present", () => {
    const item = {
      type: "resource" as const,
      name: "profile",
      description: "Fetch user profile data",
      resource: {} as never,
    };

    expect(matchesTerm(item, "profile")).toBe(true);
    expect(matchesTerm(item, "data")).toBe(true);
    expect(matchesTerm(item, "missing")).toBe(false);
  });

  test("returns true when term is empty", () => {
    const item = {
      type: "prompt" as const,
      name: "Summarize",
      prompt: {} as never,
    };

    expect(matchesTerm(item, "")).toBe(true);
    expect(matchesTerm(item, undefined)).toBe(true);
  });
});

describe("validateInputValue", () => {
  test("validates required numeric inputs", () => {
    expect(validateInputValue("abc", "number", "count", true)).toBe(
      "count must be a number",
    );
    expect(validateInputValue("1.5", "integer", "count", true)).toBe(
      "count must be an integer",
    );
    expect(validateInputValue("2", "integer", "count", true)).toBe(true);
  });

  test("validates booleans and JSON types", () => {
    expect(validateInputValue("yes", "boolean", "flag", true)).toBe(
      "flag must be true or false",
    );
    expect(validateInputValue("true", "boolean", "flag", true)).toBe(true);
    expect(validateInputValue("[]", "object", "payload", true)).toBe(
      "payload must be a JSON object",
    );
    expect(validateInputValue("{}", "object", "payload", true)).toBe(true);
    expect(validateInputValue("{}", "array", "items", true)).toBe(
      "items must be a JSON array",
    );
    expect(validateInputValue("[]", "array", "items", true)).toBe(true);
  });

  test("accepts empty optional values", () => {
    expect(validateInputValue("", "number", "count", false)).toBe(true);
  });
});

describe("parseInputValue", () => {
  test("parses numbers, booleans, and JSON", () => {
    expect(parseInputValue("2", "number")).toBe(2);
    expect(parseInputValue("false", "boolean")).toBe(false);
    expect(parseInputValue('{"a":1}', "object")).toEqual({ a: 1 });
    expect(parseInputValue("[1,2]", "array")).toEqual([1, 2]);
  });
});
