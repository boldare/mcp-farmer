import { describe, test, expect } from "bun:test";
import type * as acp from "@agentclientprotocol/sdk";

import { ProbeClient } from "./acp.js";

function createTestSpinner() {
  let lastMessage = "";
  return {
    start: (msg: string) => {
      lastMessage = msg;
    },
    stop: (msg: string) => {
      lastMessage = msg;
    },
    message: (msg: string) => {
      lastMessage = msg;
    },
    getLastMessage: () => lastMessage,
  };
}

function makeSessionUpdate(update: acp.SessionUpdate): acp.SessionNotification {
  return {
    sessionId: "session-1",
    update,
  };
}

describe("ProbeClient progress", () => {
  test("counts unique tools even when non-mcp calls interleave", async () => {
    const client = new ProbeClient();
    const spinner = createTestSpinner();
    client.setSpinner(spinner);
    client.setTotalTools(1);

    const mcpKind = "mcp" as acp.ToolKind;

    await client.sessionUpdate(
      makeSessionUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "tool-1",
        title: "mcp__Server__toolA",
        kind: mcpKind,
      }),
    );

    await client.sessionUpdate(
      makeSessionUpdate({
        sessionUpdate: "tool_call",
        toolCallId: "tool-2",
        title: "read /tmp/example.txt",
        kind: "read",
      }),
    );

    await client.sessionUpdate(
      makeSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-1",
        status: "completed",
        kind: mcpKind,
      }),
    );

    const message = spinner.getLastMessage();
    expect(message).toMatchInlineSnapshot(`"Analyzing (1/1 tools, 1 calls)"`)
  });
});
