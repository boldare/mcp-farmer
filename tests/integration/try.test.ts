import { describe, test, expect } from "bun:test";

import { runCli } from "./helpers/spawn.js";

describe("try command", () => {
  describe("argument parsing", () => {
    test("shows help with --help flag", async () => {
      const { exitCode, stdout } = await runCli(["try", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer try");
      expect(stdout).toContain("Interactively call tools or read resources");
    });

    test("shows help with -h flag", async () => {
      const { exitCode, stdout } = await runCli(["try", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer try");
    });

    test("exits with code 2 when no URL or command provided", async () => {
      const { exitCode, stderr } = await runCli(["try"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("URL or command is required");
    });

    test("exits with code 2 for invalid URL", async () => {
      const { exitCode, stderr } = await runCli(["try", "not-a-valid-url"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("URL or command is required");
    });
  });

  describe("connection errors", () => {
    test(
      "exits with code 2 for unreachable server",
      async () => {
        const { exitCode, stderr } = await runCli([
          "try",
          "http://localhost:59999/mcp",
        ]);

        expect(exitCode).toBe(2);
        expect(stderr).toContain("Error:");
      },
      { timeout: 15000 },
    );

    test(
      "exits with non-zero code for non-MCP endpoint",
      async () => {
        const { exitCode } = await runCli([
          "try",
          "https://example.com/not-mcp",
        ]);

        // May exit with 1 or 2 depending on response
        expect(exitCode).toBeGreaterThan(0);
      },
      { timeout: 15000 },
    );
  });

  describe("stdio mode", () => {
    test("exits with code 2 when command is missing after --", async () => {
      const { exitCode, stderr } = await runCli(["try", "--"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("URL or command is required");
    });
  });
});
