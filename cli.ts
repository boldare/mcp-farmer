#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { vetCommand } from "./src/vet/command.js";
import { newCommand } from "./src/new/command.js";
import { marketCommand } from "./src/market/command.js";
import { tryCommand } from "./src/try/command.js";
import { growCommand } from "./src/grow/command.js";
import { probeCommand } from "./src/probe/command.js";

function getVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = resolve(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return pkg.version;
}

function printHelp() {
  console.log(`Usage: mcp-farmer <command> [options]

A CLI tool for managing and analyzing MCP servers.

Commands:
  vet <url>        Vet an MCP server by connecting and running checks
  new              Create a new MCP server project
  market           Browse and install popular MCP servers
  try <url>        Interactively call a tool on an MCP server
  grow <feature>   Extend MCP server capabilities (eg. openapi)
  probe <url>      Probe MCP tools by calling them with AI-generated inputs

Options:
  --help       Show this help message
  --version    Show version number

Run 'mcp-farmer <command> --help' for more information on a command.`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "--version" || command === "-v") {
    console.log(getVersion());
    process.exit(0);
  }

  const subcommandArgs = args.slice(1);

  switch (command) {
    case "vet":
      await vetCommand(subcommandArgs);
      break;
    case "new":
      await newCommand(subcommandArgs);
      break;
    case "market":
      await marketCommand(subcommandArgs);
      break;
    case "try":
      await tryCommand(subcommandArgs);
      break;
    case "grow":
      await growCommand(subcommandArgs);
      break;
    case "probe":
      await probeCommand(subcommandArgs);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(2);
  }
}

main().catch((error) => {
  console.error(
    `Error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(2);
});
