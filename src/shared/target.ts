import {
  discoverServers,
  parseConfigFile,
  serverToVetTarget,
  type McpServerEntry,
} from "./config.js";
import { select, handleCancel } from "./prompts.js";

export interface StdioTarget {
  mode: "stdio";
  command: string;
  args: string[];
}

export interface HttpTarget {
  mode: "http";
  url: URL;
}

export type CommandTarget = StdioTarget | HttpTarget;

export function parseTarget(args: string[]): {
  target: CommandTarget | null;
  remainingArgs: string[];
} {
  const separatorIndex = args.indexOf("--");

  if (separatorIndex !== -1) {
    const beforeSeparator = args.slice(0, separatorIndex);
    const afterSeparator = args.slice(separatorIndex + 1);

    const command = afterSeparator[0];
    if (!command) {
      return { target: null, remainingArgs: beforeSeparator };
    }

    const commandArgs = afterSeparator.slice(1);
    return {
      target: { mode: "stdio", command, args: commandArgs },
      remainingArgs: beforeSeparator,
    };
  }

  const firstNonOption = args.find((arg) => !arg.startsWith("-"));
  if (!firstNonOption) {
    return { target: null, remainingArgs: args };
  }

  try {
    const url = new URL(firstNonOption);
    const remainingArgs = args.filter((arg) => arg !== firstNonOption);
    return { target: { mode: "http", url }, remainingArgs };
  } catch {
    return { target: null, remainingArgs: args };
  }
}

export async function selectServerFromEntries(
  entries: McpServerEntry[],
  message = "Select an MCP server:",
): Promise<McpServerEntry | null> {
  if (entries.length === 0) {
    return null;
  }

  if (entries.length === 1) {
    return entries[0] ?? null;
  }

  try {
    const selection = await select({
      message,
      choices: entries.map((entry) => ({
        value: entry,
        name: entry.name,
        description: entry.config.url ?? entry.config.command?.toString(),
      })),
    });

    return selection;
  } catch (error) {
    handleCancel(error);
  }
}

export async function resolveTargetFromConfig(
  configPath: string | undefined,
  selectMessage?: string,
): Promise<CommandTarget | null> {
  let entries: McpServerEntry[];

  if (configPath) {
    try {
      entries = await parseConfigFile(configPath);
    } catch (error) {
      console.error(`Error reading config file: ${configPath}`);
      if (error instanceof Error) {
        console.error(error.message);
      }
      process.exit(2);
    }
  } else {
    entries = await discoverServers();
  }

  if (entries.length === 0) {
    return null;
  }

  const selected = await selectServerFromEntries(entries, selectMessage);
  if (!selected) {
    return null;
  }

  const target = serverToVetTarget(selected);
  if (!target) {
    console.error(
      `Cannot use server "${selected.name}": unsupported configuration`,
    );
    process.exit(2);
  }

  return target;
}
