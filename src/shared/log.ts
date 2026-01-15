import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

let currentLogPath: string | null = null;

function getLogDir(): string {
  const platform = process.platform;

  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Logs", "mcp-farmer");
  }

  // Linux/other - use XDG_STATE_HOME or fallback
  const stateHome =
    process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(stateHome, "mcp-farmer");
}

function generateLogFilename(prefix: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const uniqueId = crypto.randomBytes(4).toString("hex");
  return `${prefix}-${date}-${time}-${uniqueId}.log`;
}

function ensureLogDir(): void {
  const logDir = getLogDir();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

export function initLog(prefix: string): string {
  ensureLogDir();
  const filename = generateLogFilename(prefix);
  currentLogPath = path.join(getLogDir(), filename);
  return currentLogPath;
}

export function getLogPath(): string | null {
  return currentLogPath;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

export function log(action: string, details?: string | Error | unknown): void {
  if (!currentLogPath) {
    return;
  }

  let detailsStr: string | undefined;
  if (details instanceof Error) {
    detailsStr = details.message;
  } else if (details !== undefined) {
    if (typeof details === "object" && details !== null) {
      try {
        detailsStr = JSON.stringify(details);
      } catch {
        detailsStr = String(details);
      }
    } else {
      detailsStr = String(details);
    }
  }

  const detailsPart = detailsStr ? ` - ${detailsStr}` : "";
  const line = `[${formatTimestamp()}] ${action}${detailsPart}\n`;
  fs.appendFileSync(currentLogPath, line);
}
