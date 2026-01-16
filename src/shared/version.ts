import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function tryReadVersion(packageJsonPath: string): string | null {
  if (!existsSync(packageJsonPath)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      typeof (parsed as { version: unknown }).version === "string"
    ) {
      return (parsed as { version: string }).version;
    }
  } catch {
    // ignore
  }
  return null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// Supports both dev (`src/shared/version.ts`) and built (`dist/src/shared/version.js`) layouts.
export const CLI_VERSION =
  tryReadVersion(resolve(__dirname, "..", "..", "package.json")) ??
  tryReadVersion(resolve(__dirname, "..", "..", "..", "package.json")) ??
  "unknown";
