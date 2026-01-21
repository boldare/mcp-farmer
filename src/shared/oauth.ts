import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";

import type {
  OAuthClientMetadata,
  OAuthClientInformation,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";

const CALLBACK_PATH = "/callback";
const DEFAULT_PORT = 9876;
const AUTH_TIMEOUT_MS = 120_000; // 2 minutes

function htmlPage(title: string, color: string, message?: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="font-family: system-ui; padding: 40px; text-align: center;">
    <h1 style="color: ${color};">${title}</h1>
    ${message ? `<p>${message}</p>` : ""}
    <p>You can close this window.</p>
  </body>
</html>`;
}

export class CliOAuthProvider implements OAuthClientProvider {
  #tokens?: OAuthTokens;
  #clientInfo?: OAuthClientInformation;
  #codeVerifier?: string;
  #callbackServer?: Server;
  #port: number;
  #expectedState?: string;

  constructor(port: number = DEFAULT_PORT) {
    this.#port = port;
  }

  get redirectUrl(): string {
    return `http://127.0.0.1:${this.#port}${CALLBACK_PATH}`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "mcp-farmer",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    const state = randomBytes(16).toString("hex");
    this.#expectedState = state;
    return state;
  }

  clientInformation(): OAuthClientInformation | undefined {
    return this.#clientInfo;
  }

  saveClientInformation(info: OAuthClientInformation): void {
    this.#clientInfo = info;
  }

  tokens(): OAuthTokens | undefined {
    return this.#tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.#tokens = tokens;
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.#codeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.#codeVerifier) {
      throw new Error("Code verifier not set");
    }
    return this.#codeVerifier;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    console.log("\nOpening browser for authorization...");
    console.log(`URL: ${authorizationUrl.toString()}\n`);
    const url = authorizationUrl.toString();

    const command =
      process.platform === "darwin"
        ? { cmd: "open", args: [url] }
        : process.platform === "win32"
          ? { cmd: "cmd", args: ["/c", "start", "", url] }
          : { cmd: "xdg-open", args: [url] };

    execFile(command.cmd, command.args, (error) => {
      if (error) {
        console.warn(
          "Warning: Could not automatically open browser. Please open the URL manually in your browser.",
        );
      }
    });
  }

  waitForAuthorizationCode(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.stopCallbackServer();
        reject(new Error("Authorization timed out after 2 minutes"));
      }, AUTH_TIMEOUT_MS);

      this.#callbackServer = createServer((req, res) => {
        if (!req.url?.startsWith(CALLBACK_PATH)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const url = new URL(req.url, `http://127.0.0.1:${this.#port}`);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        clearTimeout(timeout);

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(
            htmlPage(
              "Authorization Failed",
              "#dc2626",
              errorDescription ?? error,
            ),
          );
          this.stopCallbackServer();
          reject(new Error(errorDescription ?? error));
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(htmlPage("Missing Authorization Code", "#dc2626"));
          this.stopCallbackServer();
          reject(new Error("Missing authorization code"));
          return;
        }

        if (this.#expectedState && state !== this.#expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(htmlPage("Invalid Authorization State", "#dc2626"));
          this.stopCallbackServer();
          reject(new Error("Invalid OAuth state"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          htmlPage(
            "Authorization Successful",
            "#16a34a",
            "Return to the terminal.",
          ),
        );
        this.stopCallbackServer();
        this.#expectedState = undefined;
        resolve(code);
      });

      this.#callbackServer.listen(this.#port, () => {
        console.log(
          `Waiting for authorization callback on http://127.0.0.1:${this.#port}${CALLBACK_PATH}`,
        );
      });

      this.#callbackServer.on("error", (err: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        if (err.code === "EADDRINUSE") {
          reject(
            new Error(
              `Port ${this.#port} is already in use. Try a different port with --oauth-port`,
            ),
          );
        } else {
          reject(err);
        }
      });
    });
  }

  stopCallbackServer(): void {
    if (this.#callbackServer) {
      this.#callbackServer.close();
      this.#callbackServer = undefined;
    }
  }
}
