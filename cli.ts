import { vetCommand } from "./src/vet/command.js";
import { newCommand } from "./src/new/command.js";

function printHelp() {
  console.log(`Usage: mcp-farmer <command> [options]

A CLI tool for managing and analyzing MCP servers.

Commands:
  vet <url>    Vet an MCP server by connecting and running checks
  new          Create a new MCP server project

Options:
  --help       Show this help message

Run 'mcp-farmer <command> --help' for more information on a command.`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
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
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(2);
  }
}

main();
