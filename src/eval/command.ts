import { parseArgs } from "util";
import * as path from "node:path";
import * as p from "@clack/prompts";
import * as acp from "@agentclientprotocol/sdk";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import { connect, connectStdio, ConnectionError } from "../shared/mcp.js";
import {
  discoverServers,
  parseConfigFile,
  serverToVetTarget,
  type McpServerEntry,
} from "../shared/config.js";
import { log, initLog } from "../shared/log.js";
import { pluralize } from "../shared/text.js";
import { EvalClient } from "./acp.js";
import {
  selectCodingAgent,
  connectAgent,
  AgentSession,
} from "../shared/acp.js";

interface StdioTarget {
  mode: "stdio";
  command: string;
  args: string[];
}

interface HttpTarget {
  mode: "http";
  url: URL;
}

type EvalTarget = StdioTarget | HttpTarget;

function printHelp(): void {
  console.log(`Usage: mcp-farmer eval <url> [options]
       mcp-farmer eval [options] -- <command> [args...]

Evaluate MCP server tools using an AI coding agent.

Arguments:
  url                  The URL of the MCP server to connect to (HTTP mode)
  command              The command to spawn (stdio mode, after --)

Options:
  --config <path>      Path to MCP config file (e.g., .cursor/mcp.json)
  --help               Show this help message

Examples:
  Auto-detect from config:
    mcp-farmer eval
    mcp-farmer eval --config .cursor/mcp.json

  HTTP mode:
    mcp-farmer eval http://localhost:3000/mcp

  Stdio mode:
    mcp-farmer eval -- node server.js
    mcp-farmer eval -- npx -y @modelcontextprotocol/server-memory`);
}

function parseTarget(args: string[]): {
  target: EvalTarget | null;
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

async function selectServerFromEntries(
  entries: McpServerEntry[],
): Promise<McpServerEntry | null> {
  if (entries.length === 0) {
    return null;
  }

  if (entries.length === 1) {
    return entries[0] ?? null;
  }

  const selection = await p.select({
    message: "Select an MCP server to evaluate:",
    options: entries.map((entry) => ({
      value: entry,
      label: entry.name,
      hint: entry.config.url ?? entry.config.command?.toString(),
    })),
  });

  if (p.isCancel(selection)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  return selection as McpServerEntry;
}

async function resolveTargetFromConfig(
  configPath: string | undefined,
): Promise<EvalTarget | null> {
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

  const selected = await selectServerFromEntries(entries);
  if (!selected) {
    return null;
  }

  const target = serverToVetTarget(selected);
  if (!target) {
    console.error(
      `Cannot evaluate server "${selected.name}": unsupported configuration`,
    );
    process.exit(2);
  }

  return target as EvalTarget;
}

function buildMcpServerConfig(
  target: EvalTarget,
  serverName: string,
): acp.McpServer {
  if (target.mode === "http") {
    return {
      type: "http",
      name: serverName,
      url: target.url.toString(),
      headers: [],
    };
  }

  return {
    name: serverName,
    command: target.command,
    args: target.args,
    env: [],
  };
}

function generateReportFilename(serverName: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = serverName.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
  return `mcp-eval-${safeName}-${timestamp}.md`;
}

function buildPrompt(
  tools: Tool[],
  serverName: string,
  reportPath: string,
): string {
  const toolsJson = JSON.stringify(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    null,
    2,
  );

  return `You are evaluating MCP (Model Context Protocol) tools. Your task is to test the provided tools by generating diverse test inputs and calling each tool to verify it works correctly.

## Instructions

1. For each tool listed below, analyze its input schema and description
2. Generate 2-3 diverse test cases per tool that cover:
   - Typical/happy path inputs
   - Edge cases (empty values, boundary values, special characters if applicable)
   - Different valid input combinations
3. Call each tool with the generated test inputs using the MCP tools available to you
4. Record the results (success/failure and output)
5. After testing all tools, write the markdown report to the file specified below

## Report Output

Write the evaluation report to: ${reportPath}

Use this markdown structure:

# MCP Tool Evaluation Report

## Summary
- **Server:** ${serverName}
- **Tools evaluated:** [count]
- **Date:** [ISO date]
- **Overall status:** [Pass/Fail/Partial]

## Results

### [tool_name]

**Description:** [tool description]

#### Test Case 1: [brief description]
- **Input:** \`{json input}\`
- **Result:** Success/Error
- **Output:** \`{json output or error message}\`

#### Test Case 2: ...

---

[repeat for each tool]

## Summary Table

| Tool | Tests | Passed | Failed |
|------|-------|--------|--------|
| tool_name | 3 | 3 | 0 |
| ... | ... | ... | ... |

## Tools to Evaluate

You must only call the tools listed below. Do not call any other tools.

<tools>
${toolsJson}
</tools>


Begin by calling each tool with your generated test inputs, then write the markdown report to ${reportPath}.`;
}

async function runEval(
  target: EvalTarget,
  tools: Tool[],
  serverName: string,
): Promise<void> {
  const agentChoice = await selectCodingAgent({
    agents: ["opencode", "claude-code", "gemini-cli"],
  });
  if (!agentChoice) {
    log("cancelled", "agent selection");
    process.exit(0);
  }

  log("selected_agent", agentChoice);

  const cwd = process.cwd();
  const reportFilename = generateReportFilename(serverName);
  const reportPath = path.join(cwd, reportFilename);

  const mcpServerConfig = buildMcpServerConfig(target, serverName);

  let session: AgentSession;
  let client: EvalClient;

  try {
    const result = await connectAgent({
      agent: agentChoice,
      clientFactory: () => new EvalClient(),
      mcpServers: [mcpServerConfig],
      enableModelSelection: true,
    });
    session = result.session;
    client = result.client;
  } catch (error) {
    p.log.error("Could not start the coding agent. Is it installed?");
    log("spawn_agent_failed", error);
    process.exit(1);
  }

  const { connection, process: agentProcess, sessionId } = session;

  try {
    const toolWord = pluralize("tool", tools.length);
    const workSpinner = p.spinner();
    workSpinner.start(`Evaluating ${tools.length} ${toolWord}...`);

    client.setSpinner(workSpinner);

    const promptText = buildPrompt(tools, serverName, reportPath);

    const promptResult = await connection.prompt({
      sessionId,
      prompt: [
        {
          type: "text",
          text: promptText,
        },
      ],
    });

    if (promptResult.stopReason === "end_turn") {
      client.stopSpinner(`Evaluated ${tools.length} ${toolWord}`);
      p.log.info(`Report written to: ${reportPath}`);
      p.outro("Evaluation complete.");
      log("session_completed", "end_turn");
    } else if (promptResult.stopReason === "cancelled") {
      client.stopSpinner("Cancelled");
      p.cancel("Evaluation was cancelled.");
      log("session_completed", "cancelled");
    } else {
      client.stopSpinner("Complete");
      p.log.info(`Report written to: ${reportPath}`);
      p.outro("Evaluation complete.");
      log("session_completed", promptResult.stopReason);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(`Something went wrong: ${message}`);
    log("agent_error", error);
    process.exit(1);
  } finally {
    agentProcess.kill();
  }
}

export async function evalCommand(args: string[]) {
  initLog("eval");

  const { target, remainingArgs } = parseTarget(args);

  const { values } = parseArgs({
    args: remainingArgs,
    options: {
      config: {
        short: "c",
        type: "string",
      },
      help: {
        short: "h",
        type: "boolean",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  let resolvedTarget = target;

  if (!resolvedTarget) {
    resolvedTarget = await resolveTargetFromConfig(values.config as string);
  }

  if (!resolvedTarget) {
    if (values.config) {
      console.error(`No MCP servers found in config file: ${values.config}\n`);
    } else {
      console.error(
        "Error: No MCP servers found. Provide a URL, command, or config file.\n",
      );
    }
    printHelp();
    process.exit(2);
  }

  p.intro("MCP Tool Evaluation");

  const s = p.spinner();
  s.start("Connecting to server...");

  let mcpClient: Client;
  let transport: Transport;
  let serverName: string;

  try {
    if (resolvedTarget.mode === "stdio") {
      const connection = await connectStdio(
        resolvedTarget.command,
        resolvedTarget.args,
      );
      mcpClient = connection.client;
      transport = connection.transport;
      serverName = mcpClient.getServerVersion()?.name ?? resolvedTarget.command;
    } else {
      const connection = await connect(resolvedTarget.url);
      mcpClient = connection.client;
      transport = connection.transport;
      serverName =
        mcpClient.getServerVersion()?.name ?? resolvedTarget.url.hostname;
    }

    s.stop("Connected");

    const { tools } = await mcpClient.listTools();

    if (tools.length === 0) {
      p.log.warn("No tools available on this server.");
      await transport.close();
      return;
    }

    p.log.info(`Found ${tools.length} tool(s)`);

    const toolOptions = tools.map((tool) => ({
      value: tool,
      label: tool.name,
      hint: tool.description,
    }));

    const selectedTools = await p.multiselect({
      message: "Select tools to evaluate:",
      options: toolOptions,
      required: true,
    });

    if (p.isCancel(selectedTools)) {
      p.cancel("Operation cancelled.");
      await transport.close();
      process.exit(0);
    }

    await transport.close();

    await runEval(resolvedTarget, selectedTools as Tool[], serverName);
  } catch (error) {
    s.stop("Connection failed");
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(error instanceof ConnectionError ? 2 : 1);
  }
}
