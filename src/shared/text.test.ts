import { describe, test, expect } from "bun:test";

import { pluralize } from "./text.js";

describe("pluralize", () => {
  test.each([
    ["tool", 0, "tools"],
    ["tool", 1, "tool"],
    ["tool", 2, "tools"],
    ["tool", 10, "tools"],
    ["file", 1, "file"],
    ["file", 5, "files"],
    ["query", 1, "query"],
    ["query", 3, "queries"],
    ["key", 1, "key"],
    ["key", 2, "keys"],
    ["endpoint", 0, "endpoints"],
    ["endpoint", 1, "endpoint"],
  ])('pluralize("%s", %d) returns "%s"', (word, count, expected) => {
    expect(pluralize(word, count)).toBe(expected);
  });
});
