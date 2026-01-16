import { describe, expect, test } from "bun:test";

import { parseTarget } from "./target.js";

describe("parseTarget", () => {
  test("parses stdio target after separator", () => {
    const { target, remainingArgs } = parseTarget([
      "-v",
      "--",
      "node",
      "script.js",
      "--flag",
    ]);

    expect(remainingArgs).toEqual(["-v"]);
    expect(target).toEqual({
      mode: "stdio",
      command: "node",
      args: ["script.js", "--flag"],
    });
  });

  test("returns null target when separator has no command", () => {
    const { target, remainingArgs } = parseTarget(["--foo", "--"]);

    expect(remainingArgs).toEqual(["--foo"]);
    expect(target).toBeNull();
  });

  test("parses http target from first non-option arg", () => {
    const { target, remainingArgs } = parseTarget([
      "--verbose",
      "http://localhost:3000",
      "--foo",
    ]);

    expect(remainingArgs).toEqual(["--verbose", "--foo"]);
    expect(target?.mode).toBe("http");
    if (target?.mode === "http") {
      expect(target.url).toEqual(new URL("http://localhost:3000"));
    }
  });

  test("returns null target for invalid url", () => {
    const { target, remainingArgs } = parseTarget(["not-a-url"]);

    expect(remainingArgs).toEqual(["not-a-url"]);
    expect(target).toBeNull();
  });

  test("returns null target when only options are provided", () => {
    const { target, remainingArgs } = parseTarget(["-v", "--help"]);

    expect(remainingArgs).toEqual(["-v", "--help"]);
    expect(target).toBeNull();
  });
});
