export type ExitCode = 0 | 1 | 2;

class CliError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export class ConfigError extends CliError {
  constructor(message: string) {
    super(message, 2);
    this.name = "ConfigError";
  }
}

export class UserCancelledError extends CliError {
  constructor(message = "Operation cancelled.") {
    super(message, 0);
    this.name = "UserCancelledError";
  }
}

export function getExitCode(error: unknown): ExitCode {
  if (error instanceof CliError) return error.exitCode;
  return 2;
}

export function isUserCancelledError(error: unknown): boolean {
  return error instanceof UserCancelledError;
}
