import { describe, test, expect } from "bun:test";
import type * as acp from "@agentclientprotocol/sdk";

import { CodingClient } from "./acp.js";

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

describe("CodingClient spinner progress", () => {
  test("tracks read/write/list/search/command counts", async () => {
    const client = new CodingClient();
    const spinner = createTestSpinner();
    client.setSpinner(spinner);

    await client.sessionUpdate(
      makeSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "read-1",
        status: "completed",
        kind: "read",
        title: "read /tmp/example.txt",
      }),
    );

    await client.sessionUpdate(
      makeSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "list-1",
        status: "completed",
        kind: "read",
        title: "list /tmp",
      }),
    );

    await client.sessionUpdate(
      makeSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "write-1",
        status: "completed",
        kind: "edit",
        title: "write /tmp/output.ts",
      }),
    );

    await client.sessionUpdate(
      makeSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "search-1",
        status: "completed",
        kind: "other",
        title: "search src",
      }),
    );

    await client.sessionUpdate(
      makeSessionUpdate({
        sessionUpdate: "tool_call_update",
        toolCallId: "shell-1",
        status: "completed",
        kind: "other",
        title: "shell ls",
      }),
    );

    const message = spinner.getLastMessage();
    expect(message).toMatchInlineSnapshot(
      `"Writing code (1 file created, 1 file analyzed, 1 path listed, 1 search, 1 command)"`,
    );
  });
});
