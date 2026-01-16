import {
  discoverServers,
  parseConfigFile,
  type McpServerEntry,
} from "./config.js";
import { select, handleCancel } from "./prompts.js";

interface StdioTarget {
  mode: "stdio";
  command: string;
  args: string[];
}

interface HttpTarget {
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

  const firstNonOptionIndex = args.findIndex((arg) => !arg.startsWith("-"));
  if (firstNonOptionIndex === -1) {
    return { target: null, remainingArgs: args };
  }

  const firstNonOption = args[firstNonOptionIndex];
  if (!firstNonOption) {
    return { target: null, remainingArgs: args };
  }

  try {
    const url = new URL(firstNonOption);
    const remainingArgs = [
      ...args.slice(0, firstNonOptionIndex),
      ...args.slice(firstNonOptionIndex + 1),
    ];
    return { target: { mode: "http", url }, remainingArgs };
  } catch {
    return { target: null, remainingArgs: args };
  }
}

async function selectServerFromEntries(
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

function mapServerToDCommandTarget(
  entry: McpServerEntry,
): CommandTarget | null {
  const { config } = entry;

  // HTTP mode
  if (config.url) {
    try {
      return { mode: "http", url: new URL(config.url) };
    } catch {
      return null;
    }
  }

  // Stdio mode
  if (config.command) {
    if (Array.isArray(config.command)) {
      // OpenCode style: command is an array
      const [cmd, ...cmdArgs] = config.command;
      if (!cmd) return null;
      return { mode: "stdio", command: cmd, args: cmdArgs };
    }
    // Standard style: command is string, args is array
    return {
      mode: "stdio",
      command: config.command,
      args: config.args ?? [],
    };
  }

  return null;
}

export async function resolveTargetFromConfig(
  configPath: string | undefined,
  selectMessage?: string,
): Promise<CommandTarget | null> {
  let entries: McpServerEntry[];

  if (configPath) {
    try {
      entries = await parseConfigFile(configPath);
      if (entries.length === 0) {
        console.warn(
          `Warning: Config file exists but contains no valid MCP servers: ${configPath}`,
        );
      }
    } catch (error) {
      console.error(`Error reading config file: ${configPath}`);
      if (error instanceof Error) {
        console.error(error.message);
      }
      console.warn(
        "The config file may be corrupted or contain invalid JSON. Please check the file.",
      );
      process.exit(2);
    }
  } else {
    entries = await discoverServers();
    if (entries.length === 0) {
      console.warn("Warning: No MCP config files found in standard locations.");
    }
  }

  if (entries.length === 0) {
    return null;
  }

  const selected = await selectServerFromEntries(entries, selectMessage);
  if (!selected) {
    return null;
  }

  const target = mapServerToDCommandTarget(selected);
  if (!target) {
    console.error(
      `Cannot use server "${selected.name}": unsupported configuration`,
    );
    process.exit(2);
  }

  return target;
}
