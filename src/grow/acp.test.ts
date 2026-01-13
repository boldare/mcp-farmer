import {
  describe,
  expect,
  test,
  spyOn,
  beforeEach,
  afterEach,
  Mock,
} from "bun:test";
import {
  shortPath,
  formatDiffStats,
  getToolDisplayTitle,
  extractDiffFromContent,
  hashDiff,
} from "./acp.js";

describe("shortPath", () => {
  let cwdSpy: Mock<typeof process.cwd>;

  beforeEach(() => {
    cwdSpy = spyOn(process, "cwd").mockReturnValue("/Users/me/project");
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    cwdSpy.mockClear();
  });

  test("returns relative path when file is in cwd", () => {
    expect(shortPath("/Users/me/project/src/file.ts")).toBe("src/file.ts");
  });

  test("returns basename when file is outside cwd", () => {
    expect(shortPath("/other/path/file.ts")).toBe("file.ts");
  });

  test("handles nested paths in cwd", () => {
    expect(shortPath("/Users/me/project/src/deep/nested/file.ts")).toBe(
      "src/deep/nested/file.ts",
    );
  });
});

describe("formatDiffStats", () => {
  test("returns empty string when no changes", () => {
    expect(formatDiffStats(0, 0)).toBe("");
  });

  test("shows only additions when no deletions", () => {
    expect(formatDiffStats(10, 0)).toBe(" (\x1b[32m+10\x1b[0m)");
  });

  test("shows only deletions when no additions", () => {
    expect(formatDiffStats(0, 5)).toBe(" (\x1b[31m-5\x1b[0m)");
  });

  test("shows both additions and deletions", () => {
    expect(formatDiffStats(10, 5)).toBe(
      " (\x1b[32m+10\x1b[0m \x1b[31m-5\x1b[0m)",
    );
  });
});

describe("getToolDisplayTitle", () => {
  test("returns 'Writing file...' for edit kind", () => {
    expect(getToolDisplayTitle("edit", "Write")).toBe("Writing file...");
  });

  test("returns 'Listing directory...' for read kind with list title", () => {
    expect(getToolDisplayTitle("read", "list")).toBe("Listing directory...");
    expect(getToolDisplayTitle("read", "List")).toBe("Listing directory...");
  });

  test("returns 'Reading file...' for read kind with other title", () => {
    expect(getToolDisplayTitle("read", "Read")).toBe("Reading file...");
    expect(getToolDisplayTitle("read", "file")).toBe("Reading file...");
  });

  test("returns title for unknown kind", () => {
    expect(getToolDisplayTitle("other", "CustomTool")).toBe("CustomTool");
  });

  test("returns 'Running...' when no title provided", () => {
    expect(getToolDisplayTitle("other", null)).toBe("Running...");
    expect(getToolDisplayTitle(null, null)).toBe("Running...");
  });
});

describe("extractDiffFromContent", () => {
  test("returns undefined for null content", () => {
    expect(extractDiffFromContent(null)).toBeUndefined();
  });

  test("returns undefined for undefined content", () => {
    expect(extractDiffFromContent(undefined)).toBeUndefined();
  });

  test("returns undefined when no diff in content", () => {
    const content = [
      { type: "terminal" as const, text: "hello", terminalId: "1" },
    ];
    expect(extractDiffFromContent(content)).toBeUndefined();
  });

  test("returns diff when present", () => {
    const diff = {
      type: "diff" as const,
      path: "/test.ts",
      newText: "new content",
      oldText: "old content",
    };
    const content = [
      { type: "terminal" as const, text: "hello", terminalId: "1" },
      diff,
    ];
    expect(extractDiffFromContent(content)).toEqual(diff);
  });

  test("returns first diff when multiple present", () => {
    const diff1 = {
      type: "diff" as const,
      path: "/first.ts",
      newText: "first",
    };
    const diff2 = {
      type: "diff" as const,
      path: "/second.ts",
      newText: "second",
    };
    const content = [diff1, diff2];
    expect(extractDiffFromContent(content)).toEqual(diff1);
  });
});

describe("hashDiff", () => {
  test("creates hash from path and text lengths", () => {
    const diff = {
      path: "/test.ts",
      newText: "abc",
      oldText: "ab",
    };
    expect(hashDiff(diff)).toBe("/test.ts:3:2");
  });

  test("handles missing oldText", () => {
    const diff = {
      path: "/new-file.ts",
      newText: "new content",
    };
    expect(hashDiff(diff)).toBe("/new-file.ts:11:0");
  });

  test("handles empty texts", () => {
    const diff = {
      path: "/empty.ts",
      newText: "",
      oldText: "",
    };
    expect(hashDiff(diff)).toBe("/empty.ts:0:0");
  });
});
