import * as p from "@clack/prompts";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";

type PackageManager = "npm" | "pnpm" | "yarn" | "deno" | "bun";

const initCommands: Record<PackageManager, string[]> = {
  npm: ["npm", "init", "-y"],
  pnpm: ["pnpm", "init"],
  yarn: ["yarn", "init", "-y"],
  deno: ["deno", "init"],
  bun: ["bun", "init", "-y"],
};

const addCommands: Record<PackageManager, string[]> = {
  npm: ["npm", "install"],
  pnpm: ["pnpm", "add"],
  yarn: ["yarn", "add"],
  deno: ["deno", "add"],
  bun: ["bun", "add"],
};

const dependencies = ["@modelcontextprotocol/sdk", "zod"];
const devDependencies = ["typescript", "@types/node"];

const addDevCommands: Record<PackageManager, string[]> = {
  npm: ["npm", "install", "-D"],
  pnpm: ["pnpm", "add", "-D"],
  yarn: ["yarn", "add", "-D"],
  deno: ["deno", "add", "--dev"],
  bun: ["bun", "add", "-d"],
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, "templates");

function printHelp() {
  console.log(`Usage: mcp-farmer new [options]

Create a new MCP server project.

Options:
  --help       Show this help message

Examples:
  mcp-farmer new`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function runCommand(
  command: string[],
  cwd: string,
): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const [cmd, ...args] = command;
    if (!cmd) {
      reject(new Error("Command is required"));
      return;
    }
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code: number | null) => {
      resolve({ exitCode: code ?? 1, stderr });
    });
  });
}

async function copyTemplate(
  templateName: string,
  targetPath: string,
  replacements: Record<string, string> = {},
) {
  if (await fileExists(targetPath)) {
    return;
  }

  const sourcePath = join(templatesDir, templateName);
  let content = await readFile(sourcePath, "utf-8");

  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }

  await writeFile(targetPath, content);
}

const scriptRunners: Record<PackageManager, string> = {
  npm: "node",
  pnpm: "node",
  yarn: "node",
  deno: "deno run",
  bun: "bun",
};

async function addPackageScripts(
  packageJsonPath: string,
  packageManager: PackageManager,
) {
  const content = await readFile(packageJsonPath, "utf-8");
  const pkg = JSON.parse(content);

  const runner = scriptRunners[packageManager];
  pkg.scripts = {
    ...pkg.scripts,
    http: `${runner} http.ts`,
    stdio: `${runner} stdio.ts`,
  };

  await writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n");
}

export async function newCommand(args: string[]) {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  p.intro("Create a new MCP server");

  const project = await p.group(
    {
      name: () =>
        p.text({
          message: "Server name:",
          placeholder: "my-mcp-server",
          validate(value) {
            if (!value) return "Name is required";
          },
        }),
      path: ({ results }) =>
        p.text({
          message: "Directory path:",
          placeholder: `./${results.name}`,
          initialValue: `./${results.name}`,
          validate(value) {
            if (!value) return "Path is required";
          },
        }),
      language: () =>
        p.select({
          message: "Language:",
          options: [{ value: "typescript", label: "TypeScript" }],
        }),
      packageManager: () =>
        p.select({
          message: "Package manager:",
          options: [
            { value: "npm", label: "npm" },
            { value: "pnpm", label: "pnpm" },
            { value: "yarn", label: "yarn" },
            { value: "deno", label: "deno" },
            { value: "bun", label: "bun" },
          ],
        }),
    },
    {
      onCancel: () => {
        p.cancel("Operation cancelled.");
        process.exit(0);
      },
    },
  );

  const name = project.name as string;
  const path = project.path as string;
  const packageManager = project.packageManager as PackageManager;
  const targetDir = join(process.cwd(), path);

  const projectExists = await fileExists(join(targetDir, "package.json"));
  if (projectExists) {
    p.cancel(
      `Directory ${path} already contains a project (package.json exists).`,
    );
    process.exit(1);
  }

  const s = p.spinner();

  await mkdir(targetDir, { recursive: true });

  s.start("Initializing project");

  try {
    const initCmd = initCommands[packageManager];
    const { exitCode, stderr } = await runCommand(initCmd, targetDir);

    if (exitCode !== 0) {
      throw new Error(`Init failed with exit code ${exitCode}: ${stderr}`);
    }

    await addPackageScripts(join(targetDir, "package.json"), packageManager);

    s.stop("Project initialized");
  } catch (error) {
    s.stop("Failed to initialize project");
    console.error(error);
    process.exit(1);
  }

  s.start("Creating project files");

  try {
    const replacements = { name };

    await Promise.all([
      copyTemplate("server.ts", join(targetDir, "server.ts"), replacements),
      copyTemplate("stdio.ts", join(targetDir, "stdio.ts")),
      copyTemplate("http.ts", join(targetDir, "http.ts")),
      copyTemplate("tsconfig.json", join(targetDir, "tsconfig.json")),
      copyTemplate("gitignore", join(targetDir, ".gitignore")),
    ]);

    s.stop("Project files created");
  } catch (error) {
    s.stop("Failed to create project files");
    console.error(error);
    process.exit(1);
  }

  s.start("Adding dependencies");

  try {
    const addCmd = [...addCommands[packageManager], ...dependencies];
    const { exitCode, stderr } = await runCommand(addCmd, targetDir);

    if (exitCode !== 0) {
      throw new Error(`Add failed with exit code ${exitCode}: ${stderr}`);
    }

    s.stop("Dependencies added");
  } catch (error) {
    s.stop("Failed to add dependencies");
    console.error(error);
    process.exit(1);
  }

  s.start("Adding dev dependencies");

  try {
    const addDevCmd = [...addDevCommands[packageManager], ...devDependencies];
    const { exitCode, stderr } = await runCommand(addDevCmd, targetDir);

    if (exitCode !== 0) {
      throw new Error(
        `Add dev dependencies failed with exit code ${exitCode}: ${stderr}`,
      );
    }

    s.stop("Dev dependencies added");
  } catch (error) {
    s.stop("Failed to add dev dependencies");
    console.error(error);
    process.exit(1);
  }

  const runPrefix = packageManager === "npm" ? "npm run" : packageManager;

  p.outro(
    `Your MCP server is ready!\n\n` +
      `  cd ${path}\n\n` +
      `Run your server:\n` +
      `  ${runPrefix} stdio   # stdio transport\n` +
      `  ${runPrefix} http    # HTTP transport\n\n` +
      `Note: Requires Node.js 22+`,
  );
}
