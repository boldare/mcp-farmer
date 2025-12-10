import { vetCommand } from "./src/vet/command.js";

function printHelp() {
  console.log(`Usage: mcp-farmer <command> [options]

A CLI tool for managing and analyzing MCP servers.

Commands:
  vet <url>    Vet an MCP server by connecting and running checks

Options:
  --help       Show this help message

Run 'mcp-farmer <command> --help' for more information on a command.`);
}

async function main() {
  const args = Bun.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case "vet":
      await vetCommand(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(2);
  }
}

main();
