import { parseArgs } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";

import { fileExists } from "../shared/config.js";
import {
  input,
  select,
  confirm,
  spinner,
  intro,
  outro,
  log,
  cancel,
  handleCancel,
} from "../shared/prompts.js";

type PackageManager = "npm" | "pnpm" | "yarn" | "deno" | "bun";

const installCommands: Record<PackageManager, string> = {
  npm: "npm install",
  pnpm: "pnpm install",
  yarn: "yarn install",
  deno: "deno install",
  bun: "bun install",
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, "templates");

function printHelp() {
  console.log(`Usage: mcp-farmer new [options]

Create a new MCP server project.

Options:
  --name <name>            Server name (required if using CLI args)
  --path <path>            Directory path (defaults to ./<name>)
  --type <type>            Server type: local (stdio) or remote (HTTP) (default: remote)
  --http-framework <type>  HTTP framework: native or hono (default: native, remote only)
  --package-manager <pm>   Package manager: npm, pnpm, yarn, deno, or bun
  --no-git                 Skip git initialization
  --deploy <option>        Deployment option: docker, netlify (remote server only)
  --help                   Show this help message

Server Types:
  remote                   HTTP-based server requiring deployment, accessible via URL
  local                    stdio-only server for local integration, simpler but needs manual setup

Examples:
  mcp-farmer new
  mcp-farmer new --name my-server
  mcp-farmer new --name my-server --type local --package-manager bun
    mcp-farmer new --name my-server --type remote --http-framework hono --deploy docker`);
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
  npm: "tsx",
  pnpm: "tsx",
  yarn: "tsx",
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

function buildPackageJsonScripts(
  packageManager: PackageManager,
  transports: string[],
): Record<string, string> {
  const runner = scriptRunners[packageManager];
  const scripts: Record<string, string> = {
    build: "tsc",
  };

  if (transports.includes("http")) {
    scripts.http = `${runner} src/http.ts`;
  }
  if (transports.includes("stdio")) {
    scripts.stdio = `${runner} src/stdio.ts`;
  }

  return scripts;
}

async function copyPackageJson(
  targetPath: string,
  name: string,
  scripts: Record<string, string>,
  extraDependencies: Record<string, string>,
  extraDevDependencies: Record<string, string>,
) {
  const sourcePath = join(templatesDir, "package.json");
  const content = await readFile(sourcePath, "utf-8");
  const pkg = JSON.parse(content);

  pkg.name = name;
  pkg.scripts = scripts;
  pkg.dependencies = { ...pkg.dependencies, ...extraDependencies };
  pkg.devDependencies = { ...pkg.devDependencies, ...extraDevDependencies };

  await writeFile(targetPath, JSON.stringify(pkg, null, 2) + "\n");
}

const validPackageManagers = ["npm", "pnpm", "yarn", "deno", "bun"] as const;
const validServerTypes = ["local", "remote"] as const;
const validHttpFrameworks = ["native", "hono"] as const;
const validDeployOptions = ["docker", "netlify"] as const;

type ServerType = (typeof validServerTypes)[number];

export async function newCommand(args: string[]) {
  let values;
  try {
    const parsed = parseArgs({
      args,
      options: {
        name: { type: "string" },
        path: { type: "string" },
        type: { type: "string" },
        "http-framework": { type: "string" },
        "package-manager": { type: "string" },
        "no-git": { type: "boolean", default: false },
        deploy: { type: "string" },
        help: { short: "h", type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    });
    values = parsed.values;
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    printHelp();
    process.exit(2);
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  // Validate CLI args if provided
  if (
    values["package-manager"] &&
    !validPackageManagers.includes(
      values["package-manager"] as (typeof validPackageManagers)[number],
    )
  ) {
    console.error(
      `Invalid package manager: ${values["package-manager"]}. Valid options: ${validPackageManagers.join(", ")}`,
    );
    process.exit(2);
  }

  if (
    values.type &&
    !validServerTypes.includes(values.type as (typeof validServerTypes)[number])
  ) {
    console.error(
      `Invalid server type: ${values.type}. Valid options: ${validServerTypes.join(", ")}`,
    );
    process.exit(2);
  }

  if (
    values["http-framework"] &&
    !validHttpFrameworks.includes(
      values["http-framework"] as (typeof validHttpFrameworks)[number],
    )
  ) {
    console.error(
      `Invalid HTTP framework: ${values["http-framework"]}. Valid options: ${validHttpFrameworks.join(", ")}`,
    );
    process.exit(2);
  }

  if (
    values.deploy &&
    !validDeployOptions.includes(
      values.deploy as (typeof validDeployOptions)[number],
    )
  ) {
    console.error(
      `Invalid deploy option: ${values.deploy}. Valid options: ${validDeployOptions.join(", ")}`,
    );
    process.exit(2);
  }

  // Validate that --deploy and --http-framework require remote server type
  if (values.type === "local") {
    if (values.deploy) {
      console.error("--deploy requires remote server type (--type remote)");
      process.exit(2);
    }
    if (values["http-framework"]) {
      console.error(
        "--http-framework requires remote server type (--type remote)",
      );
      process.exit(2);
    }
  }

  intro("Create a new MCP server");

  let name: string;
  let projectPath: string;
  let serverType: ServerType;
  let httpFramework: string | undefined;
  let packageManager: PackageManager;
  let initGit: boolean;
  let deployOption: string | undefined;

  try {
    // Name prompt
    if (values.name) {
      name = values.name;
    } else {
      name = await input({
        message: "Server name:",
        validate(value) {
          if (!value) return "Name is required";
          return true;
        },
      });
    }

    // Path prompt
    if (values.path) {
      projectPath = values.path;
    } else {
      const defaultPath = `./${name}`;
      projectPath = await input({
        message: "Directory path:",
        default: defaultPath,
        validate(value) {
          if (!value) return "Path is required";
          return true;
        },
      });
    }

    // Server type prompt
    if (values.type) {
      serverType = values.type as ServerType;
    } else {
      serverType = await select({
        message: "Server type:",
        default: "remote",
        choices: [
          {
            value: "remote" as const,
            name: "Remote (HTTP-based)",
            description:
              "Requires deployment but accessible via URL - easier for non-technical users to connect",
          },
          {
            value: "local" as const,
            name: "Local (stdio-only)",
            description:
              "Simpler to build but requires installation and technical skills to set up on each machine",
          },
        ],
      });
    }

    // HTTP framework prompt (only for remote servers)
    if (serverType === "local") {
      httpFramework = undefined;
    } else if (values["http-framework"]) {
      httpFramework = values["http-framework"];
    } else {
      httpFramework = await select({
        message: "HTTP framework:",
        choices: [
          {
            value: "native",
            name: "Native Node.js HTTP",
            description: "Zero dependencies, built-in Node.js HTTP server",
          },
          {
            value: "hono",
            name: "Hono",
            description: "Lightweight web framework with better ergonomics",
          },
        ],
      });
    }

    // Package manager prompt
    if (values["package-manager"]) {
      packageManager = values["package-manager"] as PackageManager;
    } else {
      packageManager = await select({
        message: "Package manager:",
        choices: [
          { value: "npm" as const, name: "npm" },
          { value: "pnpm" as const, name: "pnpm" },
          { value: "yarn" as const, name: "yarn" },
          { value: "deno" as const, name: "deno" },
          { value: "bun" as const, name: "bun" },
        ],
      });
    }

    // Git init prompt
    if (values["no-git"]) {
      initGit = false;
    } else {
      initGit = await confirm({
        message: "Initialize a git repository?",
        default: true,
      });
    }

    // Deployment option prompt (only for remote servers)
    if (serverType === "local") {
      deployOption = undefined;
    } else if (values.deploy) {
      deployOption = values.deploy;
    } else {
      const selected = await select({
        message: "Deployment option:",
        choices: [
          { value: "none", name: "None (skip)" },
          { value: "docker", name: "Docker" },
          { value: "netlify", name: "Netlify Functions" },
        ],
      });
      deployOption = selected === "none" ? undefined : selected;
    }
  } catch (error) {
    handleCancel(error);
  }

  const transports = serverType === "local" ? ["stdio"] : ["http", "stdio"];

  const targetDir = join(process.cwd(), projectPath);

  const projectExists = await fileExists(join(targetDir, "package.json"));
  if (projectExists) {
    cancel(
      `Directory ${projectPath} already contains a project (package.json exists).`,
    );
    process.exit(1);
  }

  const s = spinner();

  await mkdir(targetDir, { recursive: true });
  const srcDir = join(targetDir, "src");
  await mkdir(srcDir, { recursive: true });

  const runPrefix = packageManager === "npm" ? "npm run" : packageManager;
  const packageRunner = packageRunners[packageManager];
  const installCommand = installCommands[packageManager];

  s.start("Creating project files");

  try {
    const resolvedHttpFramework = httpFramework ?? "native";
    const httpTemplate =
      resolvedHttpFramework === "hono" ? "src/http-hono.ts" : "src/http.ts";
    const useHono =
      transports.includes("http") && resolvedHttpFramework === "hono";

    const scripts = buildPackageJsonScripts(packageManager, transports);

    const useNetlify = deployOption === "netlify";

    const extraDependencies: Record<string, string> = {};
    if (useHono) {
      extraDependencies["hono"] = "^4.11.1";
      extraDependencies["@hono/node-server"] = "^1.19.7";
      extraDependencies["fetch-to-node"] = "^2.1.0";
    }
    if (useNetlify) {
      extraDependencies["fetch-to-node"] = "^2.1.0";
      extraDependencies["@netlify/functions"] = "^3.0.0";
    }

    const extraDevDependencies: Record<string, string> = {};
    if (packageManager === "bun") {
      extraDevDependencies["@types/bun"] = "^1.3.4";
    } else if (packageManager !== "deno") {
      extraDevDependencies["tsx"] = "^4.19.4";
    }
    if (useNetlify) {
      extraDevDependencies["netlify-cli"] = "^23.13.5";
    }

    const readmeReplacements: Record<string, string> = {
      name,
      installCommand: installCommand,
      runCommand: transports.includes("http")
        ? `${runPrefix} http`
        : `${runPrefix} stdio`,
      vetHttpCommand: `${packageRunner} mcp-farmer vet http://localhost:3000/mcp`,
      vetStdioCommand: `${packageRunner} mcp-farmer vet -- ${runPrefix} stdio`,
      httpFileDoc: transports.includes("http")
        ? "  - `http.ts` - HTTP transport entry point\n"
        : "",
      stdioFileDoc: transports.includes("stdio")
        ? "  - `stdio.ts` - stdio transport entry point\n"
        : "",
      dockerFileDoc:
        deployOption === "docker"
          ? "- `Dockerfile` - Docker container configuration\n"
          : "",
      netlifyFileDoc:
        deployOption === "netlify"
          ? "- `netlify/functions/mcp.ts` - Netlify Functions handler\n"
          : "",
      dockerSection:
        deployOption === "docker"
          ? `## Docker

\`\`\`bash
# Build Docker image
docker build -t ${name} .

# Run Docker container
docker run -p 3000:3000 ${name}
\`\`\`

`
          : "",
      netlifySection:
        deployOption === "netlify"
          ? `## Netlify

Deploy to Netlify Functions:

\`\`\`bash
# Deploy (netlify-cli is included in devDependencies)
npx netlify deploy
\`\`\`

Your MCP server will be available at \`https://your-site.netlify.app/mcp\`

`
          : "",
    };

    const filesToCopy: Promise<void>[] = [
      copyPackageJson(
        join(targetDir, "package.json"),
        name,
        scripts,
        extraDependencies,
        extraDevDependencies,
      ),
      copyTemplate("src/server.ts", join(srcDir, "server.ts"), { name }),
      copyTemplate("tsconfig.json", join(targetDir, "tsconfig.json")),
      copyTemplate("gitignore", join(targetDir, ".gitignore")),
      copyTemplate(
        "README.md",
        join(targetDir, "README.md"),
        readmeReplacements,
        true,
      ),
      copyTemplate("AGENTS.md", join(targetDir, "AGENTS.md")),
    ];

    if (transports.includes("stdio")) {
      filesToCopy.push(copyTemplate("src/stdio.ts", join(srcDir, "stdio.ts")));
    }

    if (transports.includes("http")) {
      filesToCopy.push(copyTemplate(httpTemplate, join(srcDir, "http.ts")));
    }

    if (deployOption === "docker") {
      filesToCopy.push(
        copyTemplate("Dockerfile", join(targetDir, "Dockerfile")),
        copyTemplate("dockerignore", join(targetDir, ".dockerignore")),
      );
    }

    if (deployOption === "netlify") {
      const netlifyFunctionsDir = join(targetDir, "netlify", "functions");
      await mkdir(netlifyFunctionsDir, { recursive: true });
      filesToCopy.push(
        copyTemplate(
          "netlify/functions/mcp.ts",
          join(netlifyFunctionsDir, "mcp.ts"),
        ),
      );
    }

    await Promise.all(filesToCopy);

    s.stop("Project files created");
  } catch (error) {
    s.stop("Failed to create project files");
    console.error(error);
    process.exit(1);
  }

  if (initGit) {
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

  outro(
    `Your MCP server is ready!\n\n` +
      `  cd ${projectPath}\n` +
      `  ${installCommand}\n\n` +
      runInstructions +
      `Note: Requires Node.js 20+`,
  );

  log.message(
    `What's next?\n` +
      `  mcp-farmer grow openapi   Generate tools from OpenAPI/Swagger spec\n` +
      `  mcp-farmer grow graphql   Generate tools from GraphQL endpoint\n` +
      `  mcp-farmer vet            Validate your server's tools\n` +
      `  mcp-farmer try            Test your tools interactively`,
  );

  process.exit(0);
}
