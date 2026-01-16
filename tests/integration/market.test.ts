import { describe, test, expect } from "bun:test";

import { runCli } from "./helpers/spawn.js";

describe("market command", () => {
  describe("argument parsing", () => {
    test("shows help with --help flag", async () => {
      const { exitCode, stdout } = await runCli(["market", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer market");
      expect(stdout).toContain("Browse and install popular MCP servers");
    });

    test("shows help with -h flag", async () => {
      const { exitCode, stdout } = await runCli(["market", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer market");
    });

    test("accepts unknown arguments without error", async () => {
      const { exitCode } = await runCli(["market", "--invalid-option"]);

      // Market command doesn't validate arguments, just starts interactive prompts
      // Exit code 0 because it starts the interactive prompt (which we can't interact with in tests)
      expect(exitCode).toBe(0);
    });
  });
});
