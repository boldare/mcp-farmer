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
  force = false,
) {
  if (!force && (await fileExists(targetPath))) {
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

const packageRunners: Record<PackageManager, string> = {
  npm: "npx",
  pnpm: "pnpm dlx",
  yarn: "yarn dlx",
  deno: "deno run -A npm:",
  bun: "bunx",
};

async function addPackageScripts(
  packageJsonPath: string,
  packageManager: PackageManager,
  transports: string[],
) {
  const content = await readFile(packageJsonPath, "utf-8");
  const pkg = JSON.parse(content);

  const runner = scriptRunners[packageManager];
  const scripts: Record<string, string> = {};

  if (transports.includes("http")) {
    scripts.http = `${runner} http.ts`;
  }
  if (transports.includes("stdio")) {
    scripts.stdio = `${runner} stdio.ts`;
  }

  pkg.scripts = {
    ...pkg.scripts,
    ...scripts,
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
      transports: () =>
        p.multiselect({
          message: "Transport types:",
          options: [
            { value: "stdio", label: "stdio" },
            { value: "http", label: "http" },
          ],
          required: true,
        }),
      httpFramework: ({ results }) => {
        const transports = results.transports;
        if (!transports?.includes("http")) {
          return;
        }
        return p.select({
          message: "HTTP framework:",
          options: [
            { value: "native", label: "Native Node.js HTTP" },
            { value: "hono", label: "Hono" },
          ] as const,
        });
      },
      packageManager: () =>
        p.select({
          message: "Package manager:",
          options: [
            { value: "npm", label: "npm" },
            { value: "pnpm", label: "pnpm" },
            { value: "yarn", label: "yarn" },
            { value: "deno", label: "deno" },
            { value: "bun", label: "bun" },
          ] as const,
        }),
      initGit: () =>
        p.confirm({
          message: "Initialize a git repository?",
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        p.cancel("Operation cancelled.");
        process.exit(0);
      },
    },
  );

  const name = project.name;
  const path = project.path as string;
  const transports = project.transports;
  const httpFramework = project.httpFramework ?? "native";
  const packageManager = project.packageManager;

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

    await addPackageScripts(
      join(targetDir, "package.json"),
      packageManager,
      transports,
    );

    s.stop("Project initialized");
  } catch (error) {
    s.stop("Failed to initialize project");
    console.error(error);
    process.exit(1);
  }

  const runPrefix = packageManager === "npm" ? "npm run" : packageManager;
  const packageRunner = packageRunners[packageManager];

  s.start("Creating project files");

  try {
    const httpTemplate = httpFramework === "hono" ? "http-hono.ts" : "http.ts";

    const readmeReplacements: Record<string, string> = {
      name,
      installCommand:
        packageManager === "deno"
          ? "deno install"
          : `${packageManager} install`,
      runCommand: transports.includes("http")
        ? `${runPrefix} http`
        : `${runPrefix} stdio`,
      vetHttpCommand: `${packageRunner} mcp-farmer vet http://localhost:3000/mcp`,
      vetStdioCommand: `${packageRunner} mcp-farmer vet -- ${runPrefix} stdio`,
      httpFileDoc: transports.includes("http")
        ? "- `http.ts` - HTTP transport entry point\n"
        : "",
      stdioFileDoc: transports.includes("stdio")
        ? "- `stdio.ts` - stdio transport entry point\n"
        : "",
    };

    const filesToCopy: Promise<void>[] = [
      copyTemplate("server.ts", join(targetDir, "server.ts"), { name }),
      copyTemplate("tsconfig.json", join(targetDir, "tsconfig.json")),
      copyTemplate("gitignore", join(targetDir, ".gitignore")),
      copyTemplate(
        "README.md",
        join(targetDir, "README.md"),
        readmeReplacements,
        true,
      ),
    ];

    if (transports.includes("stdio")) {
      filesToCopy.push(copyTemplate("stdio.ts", join(targetDir, "stdio.ts")));
    }

    if (transports.includes("http")) {
      filesToCopy.push(copyTemplate(httpTemplate, join(targetDir, "http.ts")));
    }

    await Promise.all(filesToCopy);

    s.stop("Project files created");
  } catch (error) {
    s.stop("Failed to create project files");
    console.error(error);
    process.exit(1);
  }

  s.start("Adding dependencies");

  try {
    const projectDependencies = [...dependencies];
    if (transports.includes("http") && httpFramework === "hono") {
      projectDependencies.push("hono", "fetch-to-node");
    }

    const addCmd = [...addCommands[packageManager], ...projectDependencies];
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

  if (project.initGit) {
    s.start("Initializing git repository");

    try {
      const { exitCode } = await runCommand(["git", "init"], targetDir);

      if (exitCode !== 0) {
        throw new Error("git init failed");
      }

      s.stop("Git repository initialized");
    } catch {
      s.stop("Skipped git initialization (git not available)");
    }
  }

  const runCommands: string[] = [];
  if (transports.includes("stdio")) {
    runCommands.push(`${runPrefix} stdio   # stdio transport`);
  }
  if (transports.includes("http")) {
    runCommands.push(`${runPrefix} http    # HTTP transport`);
  }

  const runInstructions =
    runCommands.length > 0
      ? `Run your server:\n${runCommands.map((cmd) => `  ${cmd}`).join("\n")}\n\n`
      : "";

  p.outro(
    `Your MCP server is ready!\n\n` +
      `  cd ${path}\n\n` +
      runInstructions +
      `Note: Requires Node.js 20+`,
  );
}
