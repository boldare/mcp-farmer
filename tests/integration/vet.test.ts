import { describe, test, expect } from "bun:test";

import { runCli } from "./helpers/spawn.js";

describe("vet command", () => {
  describe("argument parsing", () => {
    test("shows help with --help flag", async () => {
      const { exitCode, stdout } = await runCli(["vet", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer vet");
      expect(stdout).toContain("--output json|html");
      expect(stdout).toContain("--oauth");
    });

    test("shows help with -h flag", async () => {
      const { exitCode, stdout } = await runCli(["vet", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer vet");
    });

    test("exits with code 2 when no URL provided", async () => {
      const { exitCode, stderr } = await runCli(["vet"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("URL or command is required");
    });

    test("exits with code 2 for invalid output format", async () => {
      const { exitCode, stderr } = await runCli([
        "vet",
        "http://localhost:3000",
        "--output",
        "xml",
      ]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Invalid output format");
    });

    test("exits with code 2 for invalid URL", async () => {
      const { exitCode, stderr } = await runCli(["vet", "not-a-valid-url"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("URL or command is required");
    });
  });

  describe("connection errors", () => {
    test(
      "exits with code 2 for unreachable server",
      async () => {
        const { exitCode, stderr } = await runCli([
          "vet",
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
          "vet",
          "https://example.com/not-mcp",
        ]);

        // May exit with 1 (auth error) or 2 (connection error) depending on response
        expect(exitCode).toBeGreaterThan(0);
      },
      { timeout: 15000 },
    );
  });

  describe("stdio mode", () => {
    test("shows error when OAuth is used with stdio", async () => {
      const { exitCode, stderr } = await runCli([
        "vet",
        "--oauth",
        "--",
        "echo",
        "test",
      ]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("OAuth is not supported for stdio servers");
    });

    test("exits with code 2 when command is missing after --", async () => {
      const { exitCode, stderr } = await runCli(["vet", "--"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("URL or command is required");
    });
  });
});
