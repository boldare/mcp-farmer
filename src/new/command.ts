import * as p from "@clack/prompts";
import { parseArgs } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";

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
  --type <type>            Server type: local or remote (default: remote)
  --http-framework <type>  HTTP framework: native or hono (default: native)
  --package-manager <pm>   Package manager: npm, pnpm, yarn, deno, or bun
  --no-git                 Skip git initialization
  --deploy <option>        Deployment option: docker (remote server only)
  --help                   Show this help message

Examples:
  mcp-farmer new
  mcp-farmer new --name my-server
  mcp-farmer new --name my-server --type local --package-manager bun
  mcp-farmer new --name my-server --type remote --http-framework hono --deploy docker`);
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
const validDeployOptions = ["docker"] as const;

type ServerType = (typeof validServerTypes)[number];

export async function newCommand(args: string[]) {
  const { values } = parseArgs({
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

  p.intro("Create a new MCP server");

  const project = await p.group(
    {
      name: () => {
        if (values.name) return Promise.resolve(values.name);
        return p.text({
          message: "Server name:",
          placeholder: "my-mcp-server",
          validate(value) {
            if (!value) return "Name is required";
          },
        });
      },
      path: ({ results }) => {
        if (values.path) return Promise.resolve(values.path);
        const defaultPath = `./${results.name}`;
        return p.text({
          message: "Directory path:",
          placeholder: defaultPath,
          initialValue: defaultPath,
          validate(value) {
            if (!value) return "Path is required";
          },
        });
      },
      language: () => Promise.resolve("typescript"),
      serverType: () => {
        if (values.type) {
          return Promise.resolve(values.type as ServerType);
        }
        return p.select({
          message: "Server type:",
          options: [
            {
              value: "remote",
              label: "Remote",
              hint: "HTTP transport for hosted servers and stdio transport for local development",
            },
            {
              value: "local",
              label: "Local",
              hint: "stdio transport only for local integrations",
            },
          ],
          initialValue: "remote",
        });
      },
      httpFramework: ({ results }) => {
        if (results.serverType === "local") {
          return Promise.resolve(undefined);
        }
        if (values["http-framework"]) {
          return Promise.resolve(values["http-framework"]);
        }
        return p.select({
          message: "HTTP framework:",
          options: [
            { value: "native", label: "Native Node.js HTTP" },
            { value: "hono", label: "Hono" },
          ] as const,
        });
      },
      packageManager: () => {
        if (values["package-manager"]) {
          return Promise.resolve(values["package-manager"]);
        }
        return p.select({
          message: "Package manager:",
          options: [
            { value: "npm", label: "npm" },
            { value: "pnpm", label: "pnpm" },
            { value: "yarn", label: "yarn" },
            { value: "deno", label: "deno" },
            { value: "bun", label: "bun" },
          ] as const,
        });
      },
      initGit: () => {
        if (values["no-git"]) return Promise.resolve(false);
        return p.confirm({
          message: "Initialize a git repository?",
          initialValue: true,
        });
      },
      releaseOptions: ({ results }) => {
        if (results.serverType === "local") {
          return Promise.resolve([]);
        }
        if (values.deploy) {
          return Promise.resolve([values.deploy]);
        }
        return p.multiselect({
          message: "Release options (optional):",
          options: [{ value: "docker", label: "Dockerfile" }],
          required: false,
        });
      },
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
  const serverType = project.serverType as ServerType;
  const transports = serverType === "local" ? ["stdio"] : ["http", "stdio"];
  const httpFramework = project.httpFramework ?? "native";
  const packageManager = project.packageManager as PackageManager;
  const releaseOptions = (project.releaseOptions ?? []) as string[];

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
  const srcDir = join(targetDir, "src");
  await mkdir(srcDir, { recursive: true });

  const runPrefix = packageManager === "npm" ? "npm run" : packageManager;
  const packageRunner = packageRunners[packageManager];
  const installCommand = installCommands[packageManager];

  s.start("Creating project files");

  try {
    const httpTemplate =
      httpFramework === "hono" ? "src/http-hono.ts" : "src/http.ts";
    const useHono = transports.includes("http") && httpFramework === "hono";

    const scripts = buildPackageJsonScripts(packageManager, transports);

    const extraDependencies: Record<string, string> = useHono
      ? {
          hono: "^4.11.1",
          "@hono/node-server": "^1.19.7",
          "fetch-to-node": "^2.1.0",
        }
      : {};

    const extraDevDependencies: Record<string, string> = {};
    if (packageManager === "bun") {
      extraDevDependencies["@types/bun"] = "^1.3.4";
    } else if (packageManager !== "deno") {
      extraDevDependencies["tsx"] = "^4.19.4";
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
      dockerFileDoc: releaseOptions.includes("docker")
        ? "- `Dockerfile` - Docker container configuration\n"
        : "",
      dockerSection: releaseOptions.includes("docker")
        ? `## Docker

\`\`\`bash
# Build Docker image
docker build -t ${name} .

# Run Docker container
docker run -p 3000:3000 ${name}
\`\`\`

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

    if (releaseOptions.includes("docker")) {
      filesToCopy.push(
        copyTemplate("Dockerfile", join(targetDir, "Dockerfile")),
        copyTemplate("dockerignore", join(targetDir, ".dockerignore")),
      );
    }

    await Promise.all(filesToCopy);

    s.stop("Project files created");
  } catch (error) {
    s.stop("Failed to create project files");
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
      `  cd ${path}\n` +
      `  ${installCommand}\n\n` +
      runInstructions +
      `Note: Requires Node.js 20+`,
  );

  p.log.message(
    `What's next?\n` +
      `  mcp-farmer grow openapi   Generate tools from OpenAPI/Swagger spec\n` +
      `  mcp-farmer grow graphql   Generate tools from GraphQL endpoint\n` +
      `  mcp-farmer vet            Validate your server's tools\n` +
      `  mcp-farmer try            Test your tools interactively`,
  );
}
