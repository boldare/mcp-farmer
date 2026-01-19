import { describe, test, expect } from "bun:test";

import { runCli } from "./helpers/spawn.js";

describe("doc command", () => {
  describe("argument parsing", () => {
    test("shows help with --help flag", async () => {
      const { exitCode, stdout } = await runCli(["doc", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer doc");
      expect(stdout).toContain("--out <file>");
      expect(stdout).toContain("--remote <url>");
      expect(stdout).toContain("--local <command>");
      expect(stdout).toContain("--header <header>");
    });

    test("shows help with -h flag", async () => {
      const { exitCode, stdout } = await runCli(["doc", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer doc");
    });

    test("exits with code 2 for positional arguments", async () => {
      const { exitCode, stderr } = await runCli(["doc", "not-a-valid-url"]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Unexpected argument");
    });
  });

  describe("connection errors", () => {
    test(
      "exits with code 2 for unreachable remote server",
      async () => {
        const { exitCode, stderr } = await runCli([
          "doc",
          "--remote",
          "http://localhost:59999/mcp",
          "--out",
          "/tmp/test-doc.html",
        ]);

        expect(exitCode).toBe(2);
        expect(stderr).toContain("Error:");
      },
      { timeout: 15000 },
    );
  });
});
