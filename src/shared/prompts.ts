// src/shared/prompts.ts
import { input, select, checkbox, confirm, search } from "@inquirer/prompts";
import ora, { type Ora } from "ora";
import chalk from "chalk";
import { UserCancelledError } from "./errors.js";

// Re-export prompts
export { input, select, checkbox, confirm, search };

// Spinner type for external use
export interface SpinnerInstance {
  start: (msg: string) => void;
  stop: (msg: string) => void;
  message: (msg: string) => void;
}

// Spinner wrapper using ora (Inquirer doesn't have built-in spinner)
export function spinner(): SpinnerInstance {
  const instance: Ora = ora({ spinner: "dots" });
  return {
    start: (msg: string) => {
      instance.start(msg);
    },
    stop: (msg: string) => {
      instance.succeed(msg);
    },
    message: (msg: string) => {
      instance.text = msg;
    },
  };
}

// Logging utilities using chalk
export const log = {
  info: (msg: string) => console.log(chalk.blue("i"), msg),
  warn: (msg: string) => console.warn(chalk.yellow("!"), msg),
  error: (msg: string) => console.error(chalk.red("x"), msg),
  step: (msg: string) => console.log(chalk.cyan(">"), msg),
  message: (msg: string) => console.log(msg),
};

// Display utilities
export function intro(title: string) {
  console.log();
  console.log(chalk.bgCyan.black(` ${title} `));
  console.log();
}

export function outro(msg: string) {
  console.log();
  console.log(chalk.green("Done:"), msg);
}

export function note(content: string, title?: string) {
  console.log();
  if (title) console.log(chalk.bold(title));
  console.log(chalk.dim("|"), content.split("\n").join("\n" + chalk.dim("| ")));
  console.log();
}

export function cancel(msg: string) {
  console.error(chalk.red("x"), msg);
}

// Check if error is a user cancellation (Ctrl+C)
function isExitError(error: unknown): boolean {
  return error instanceof Error && error.name === "ExitPromptError";
}

// Handle cancellation consistently
export function handleCancel(error: unknown): never {
  if (isExitError(error)) {
    cancel("Operation cancelled.");
    throw new UserCancelledError();
  }
  throw error;
}
