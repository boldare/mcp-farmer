import { describe, test, expect } from "bun:test";

import { runCli } from "./helpers/spawn.js";

describe("grow command", () => {
  describe("argument parsing", () => {
    test("shows help with --help flag", async () => {
      const { exitCode, stdout } = await runCli(["grow", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer grow");
      expect(stdout).toContain("openapi");
      expect(stdout).toContain("graphql");
    });

    test("shows help with -h flag", async () => {
      const { exitCode, stdout } = await runCli(["grow", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer grow");
    });

    test("exits with code 2 when no feature provided", async () => {
      const { exitCode, stderr } = await runCli(["grow"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Please provide a feature");
    });

    test("exits with code 2 for invalid feature", async () => {
      const { exitCode, stderr } = await runCli(["grow", "invalid-feature"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Invalid feature");
      expect(stderr).toContain("openapi, graphql");
    });

    test("accepts unknown arguments without error", async () => {
      const { exitCode } = await runCli([
        "grow",
        "openapi",
        "--invalid-option",
      ]);

      // Grow command doesn't validate arguments, just starts interactive prompts
      // Exit code 0 because it starts the interactive prompt (which we can't interact with in tests)
      expect(exitCode).toBe(0);
    });
  });
});
