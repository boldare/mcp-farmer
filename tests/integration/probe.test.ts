import { describe, test, expect } from "bun:test";

import { runCli } from "./helpers/spawn.js";

describe("probe command", () => {
  describe("argument parsing", () => {
    test("shows help with --help flag", async () => {
      const { exitCode, stdout } = await runCli(["probe", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer probe");
      expect(stdout).toContain("--config");
    });

    test("shows help with -h flag", async () => {
      const { exitCode, stdout } = await runCli(["probe", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer probe");
    });

    test("exits with code 2 when no server target provided", async () => {
      const { exitCode, stderr } = await runCli(["probe"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("No MCP servers found");
    });

    test("exits with code 2 for invalid URL", async () => {
      const { exitCode, stderr } = await runCli(["probe", "not-a-valid-url"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("No MCP servers found");
    });

    test("exits with code 2 for unknown argument", async () => {
      const { exitCode, stderr } = await runCli([
        "probe",
        "http://localhost:3000",
        "--invalid-option",
      ]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Unknown option");
    });
  });

  describe("connection errors", () => {
    test(
      "exits with code 2 for unreachable server",
      async () => {
        const { exitCode, stderr } = await runCli([
          "probe",
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
          "probe",
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
      const { exitCode, stderr } = await runCli(["probe", "--"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("No MCP servers found");
    });
  });

  describe("config file", () => {
    test("exits with code 2 for non-existent config file", async () => {
      const { exitCode, stderr } = await runCli([
        "probe",
        "--config",
        "/non/existent/config.json",
      ]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Error reading config file");
      expect(stderr).toContain("ENOENT");
    });
  });
});
