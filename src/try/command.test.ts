import { describe, expect, test } from "bun:test";

import { matchesTerm } from "./command.js";

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
