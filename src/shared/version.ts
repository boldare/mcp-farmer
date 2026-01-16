import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function findUp(startDir: string, fileName: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, fileName);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readCliVersion(): string {
  try {
    const startDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = findUp(startDir, "package.json");
    if (!packageJsonPath) return "unknown";
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      typeof (parsed as { version: unknown }).version === "string"
    ) {
      return (parsed as { version: string }).version;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export const CLI_VERSION = readCliVersion();
