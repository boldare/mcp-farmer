import { describe, expect, test } from "bun:test";
import { createServer } from "node:http";

import { CliOAuthProvider } from "./oauth.js";

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to determine free port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("CliOAuthProvider", () => {
  test("rejects when state does not match", async () => {
    const port = await getAvailablePort();
    const provider = new CliOAuthProvider(port);
    provider.state();

    const promise = provider.waitForAuthorizationCode();
    await delay(25);

    await fetch(
      `http://127.0.0.1:${port}/callback?code=test-code&state=wrong`,
    );

    await expect(promise).rejects.toThrow("Invalid OAuth state");
  });

  test("resolves when state matches", async () => {
    const port = await getAvailablePort();
    const provider = new CliOAuthProvider(port);
    const state = provider.state();

    const promise = provider.waitForAuthorizationCode();
    await delay(25);

    await fetch(
      `http://127.0.0.1:${port}/callback?code=good-code&state=${state}`,
    );

    await expect(promise).resolves.toBe("good-code");
  });
});
