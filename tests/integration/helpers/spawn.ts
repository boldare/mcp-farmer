import { spawn } from "bun";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dir, "..", "..", "..", "cli.ts");

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCli(args: string[]): Promise<CliResult> {
  const proc = spawn(["bun", CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}
