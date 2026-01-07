import { describe, test, expect } from "bun:test";

import { runCli } from "./helpers/spawn.js";

describe("new command", () => {
  describe("argument parsing", () => {
    test("shows help with --help flag", async () => {
      const { exitCode, stdout } = await runCli(["new", "--help"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer new");
      expect(stdout).toContain("--name");
      expect(stdout).toContain("--type");
      expect(stdout).toContain("--package-manager");
    });

    test("shows help with -h flag", async () => {
      const { exitCode, stdout } = await runCli(["new", "-h"]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage: mcp-farmer new");
    });

    test("exits with code 2 for invalid package manager", async () => {
      const { exitCode, stderr } = await runCli([
        "new",
        "--name",
        "test",
        "--package-manager",
        "invalid",
      ]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Invalid package manager");
    });

    test("exits with code 2 for invalid server type", async () => {
      const { exitCode, stderr } = await runCli([
        "new",
        "--name",
        "test",
        "--type",
        "invalid",
      ]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Invalid server type");
    });

    test("exits with code 2 for invalid HTTP framework", async () => {
      const { exitCode, stderr } = await runCli([
        "new",
        "--name",
        "test",
        "--type",
        "remote",
        "--http-framework",
        "invalid",
      ]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Invalid HTTP framework");
    });

    test("exits with code 2 for invalid deploy option", async () => {
      const { exitCode, stderr } = await runCli([
        "new",
        "--name",
        "test",
        "--type",
        "remote",
        "--deploy",
        "invalid",
      ]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("Invalid deploy option");
    });
  });
});
