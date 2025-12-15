import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { saveServerConfig } from "./command.js";

describe("saveServerConfig", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mcp-farmer-test-"));
    configPath = join(tempDir, "config", "mcp.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates new config file with server when file doesn't exist", async () => {
    const serverConfig = {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-example"],
    };

    await saveServerConfig(
      configPath,
      "example-server",
      serverConfig,
      "mcpServers",
    );

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    expect(config).toMatchInlineSnapshot(`
{
  "mcpServers": {
    "example-server": {
      "args": [
        "-y",
        "@modelcontextprotocol/server-example",
      ],
      "command": "npx",
    },
  },
}
`);
  });

  test("adds server to existing config with mcpServers", async () => {
    const existingConfig = {
      mcpServers: {
        "existing-server": {
          command: "bunx",
          args: ["existing-package"],
        },
      },
    };

    await Bun.write(configPath, JSON.stringify(existingConfig));

    const newServerConfig = {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-example"],
    };

    await saveServerConfig(
      configPath,
      "new-server",
      newServerConfig,
      "mcpServers",
    );

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    expect(config).toMatchInlineSnapshot(`
{
  "mcpServers": {
    "existing-server": {
      "args": [
        "existing-package",
      ],
      "command": "bunx",
    },
    "new-server": {
      "args": [
        "-y",
        "@modelcontextprotocol/server-example",
      ],
      "command": "npx",
    },
  },
}
`);
  });

  test("uses 'servers' key for vscode config", async () => {
    const serverConfig = {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-example"],
    };

    await saveServerConfig(
      configPath,
      "vscode-server",
      serverConfig,
      "servers",
    );

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    expect(config).toMatchInlineSnapshot(`
{
  "servers": {
    "vscode-server": {
      "args": [
        "-y",
        "@modelcontextprotocol/server-example",
      ],
      "command": "npx",
    },
  },
}
`);
  });

  test("preserves other config properties when adding server", async () => {
    const existingConfig = {
      otherProperty: "value",
      someArray: [1, 2, 3],
      mcpServers: {
        "existing-server": {
          command: "bunx",
          args: ["existing-package"],
        },
      },
    };

    await Bun.write(configPath, JSON.stringify(existingConfig));

    const newServerConfig = {
      url: "http://localhost:3000",
      type: "http" as const,
    };

    await saveServerConfig(
      configPath,
      "new-server",
      newServerConfig,
      "mcpServers",
    );

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    expect(config).toMatchInlineSnapshot(`
{
  "mcpServers": {
    "existing-server": {
      "args": [
        "existing-package",
      ],
      "command": "bunx",
    },
    "new-server": {
      "type": "http",
      "url": "http://localhost:3000",
    },
  },
  "otherProperty": "value",
  "someArray": [
    1,
    2,
    3,
  ],
}
`);
  });

  test("overwrites server with same name", async () => {
    const existingConfig = {
      mcpServers: {
        "my-server": {
          command: "old-command",
          args: ["old-args"],
        },
      },
    };

    await Bun.write(configPath, JSON.stringify(existingConfig));

    const updatedServerConfig = {
      command: "new-command",
      args: ["new-args"],
    };

    await saveServerConfig(
      configPath,
      "my-server",
      updatedServerConfig,
      "mcpServers",
    );

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    expect(config).toMatchInlineSnapshot(`
{
  "mcpServers": {
    "my-server": {
      "args": [
        "new-args",
      ],
      "command": "new-command",
    },
  },
}
`);
  });

  test("creates directory structure if it doesn't exist", async () => {
    const nestedPath = join(tempDir, "deeply", "nested", "config", "mcp.json");
    const serverConfig = {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-example"],
    };

    await saveServerConfig(
      nestedPath,
      "test-server",
      serverConfig,
      "mcpServers",
    );

    const content = await readFile(nestedPath, "utf-8");
    const config = JSON.parse(content);

    expect(config).toMatchInlineSnapshot(`
{
  "mcpServers": {
    "test-server": {
      "args": [
        "-y",
        "@modelcontextprotocol/server-example",
      ],
      "command": "npx",
    },
  },
}
`);
  });

  test("handles http server config", async () => {
    const serverConfig = {
      url: "http://localhost:3000",
      type: "http" as const,
    };

    await saveServerConfig(
      configPath,
      "http-server",
      serverConfig,
      "mcpServers",
    );

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    expect(config).toMatchInlineSnapshot(`
{
  "mcpServers": {
    "http-server": {
      "type": "http",
      "url": "http://localhost:3000",
    },
  },
}
`);
  });

  test("uses 'mcp' key for opencode config with local server", async () => {
    const serverConfig = {
      type: "local" as const,
      command: ["npx", "-y", "@modelcontextprotocol/server-example"],
      enabled: true,
    };

    await saveServerConfig(
      configPath,
      "opencode-local-server",
      serverConfig,
      "mcp",
    );

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    expect(config).toMatchInlineSnapshot(`
{
  "mcp": {
    "opencode-local-server": {
      "command": [
        "npx",
        "-y",
        "@modelcontextprotocol/server-example",
      ],
      "enabled": true,
      "type": "local",
    },
  },
}
`);
  });

  test("uses 'mcp' key for opencode config with remote server", async () => {
    const serverConfig = {
      type: "remote" as const,
      url: "https://mcp.example.com/mcp",
      enabled: true,
    };

    await saveServerConfig(
      configPath,
      "opencode-remote-server",
      serverConfig,
      "mcp",
    );

    const content = await readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    expect(config).toMatchInlineSnapshot(`
{
  "mcp": {
    "opencode-remote-server": {
      "enabled": true,
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
    },
  },
}
`);
  });
});
