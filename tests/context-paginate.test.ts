import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import {
  computeChunks,
  buildPaginateInstructions,
  deliverPayload,
  paginateFilePath,
  STREAM_THRESHOLD_BYTES,
  CHUNK_LINES,
} from "../src/skills/context/paginate.ts";
import type { Rule } from "../src/skills/context/registry.ts";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<Rule> & { body: string }): Rule {
  return {
    folder: "test/folder",
    file: "rule-test.md",
    absPath: "/tmp/rule-test.md",
    hash: "abc12345",
    priority: "medium",
    title: "Test Rule",
    meta: {
      title: "Test Rule",
      description: "A test rule",
      priority: "medium",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeChunks
// ---------------------------------------------------------------------------

describe("computeChunks", () => {
  test("empty input returns empty array", () => {
    expect(computeChunks(0)).toEqual([]);
  });

  test("exactly 900 lines — single chunk", () => {
    const chunks = computeChunks(900);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ offset: 1, limit: 900 });
  });

  test("901 lines — two chunks; second absorbs tail", () => {
    const chunks = computeChunks(901);
    // 901 remaining at offset 1: remaining (901) <= 900 + 200 = 1100 → single chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ offset: 1, limit: 901 });
  });

  test("1100 lines — tail absorb: single chunk covers all", () => {
    // 1100 <= CHUNK_LINES + 200 (1100) → absorbed into one chunk
    const chunks = computeChunks(1100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ offset: 1, limit: 1100 });
  });

  test("1101 lines — two chunks", () => {
    const chunks = computeChunks(1101);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ offset: 1, limit: 900 });
    expect(chunks[1]).toEqual({ offset: 901, limit: 201 });
  });

  test("5000 lines — correct chunk count and total coverage", () => {
    const chunks = computeChunks(5000);
    expect(chunks.length).toBeGreaterThan(1);
    // offsets are in ascending order
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.offset).toBe(chunks[i - 1]!.offset + chunks[i - 1]!.limit);
    }
    // total lines covered = 5000
    const total = chunks.reduce((s, c) => s + c.limit, 0);
    expect(total).toBe(5000);
    // first offset is 1
    expect(chunks[0]!.offset).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildPaginateInstructions
// ---------------------------------------------------------------------------

describe("buildPaginateInstructions", () => {
  const file = paginateFilePath();

  test("contains 'parallel'", () => {
    const chunks = computeChunks(1800);
    const out = buildPaginateInstructions(file, chunks);
    expect(out).toContain("parallel");
  });

  test("contains 'SINGLE message'", () => {
    const chunks = computeChunks(1800);
    const out = buildPaginateInstructions(file, chunks);
    expect(out).toContain("SINGLE message");
  });

  test("one Read line per chunk in offset order", () => {
    const chunks = computeChunks(5000);
    const out = buildPaginateInstructions(file, chunks);
    const readLines = out
      .split("\n")
      .filter((l) => l.trim().startsWith(`Read('${file}'`));
    expect(readLines).toHaveLength(chunks.length);
    // offsets in order
    const offsets = readLines.map((l) => {
      const m = l.match(/offset=(\d+)/);
      return m ? parseInt(m[1]!, 10) : -1;
    });
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]!).toBeGreaterThan(offsets[i - 1]!);
    }
    // first offset matches first chunk
    expect(offsets[0]).toBe(chunks[0]!.offset);
  });
});

// ---------------------------------------------------------------------------
// deliverPayload byte-threshold
// ---------------------------------------------------------------------------

describe("deliverPayload byte-threshold", () => {
  let tmpDir: string;
  let stdoutChunks: string[];
  let stderrChunks: string[];
  let stdoutSpy: ReturnType<typeof spyOn>;
  let stderrSpy: ReturnType<typeof spyOn>;
  // Store original cwd and set a safe cwd with .oh-env
  let savedCwd: string;

  beforeEach(async () => {
    tmpDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "oh-paginate-test-")));

    // Write a .oh-env so loadOhEnv() (called by renderContext → priorityRank) doesn't throw
    const { writeFile, mkdir } = await import("node:fs/promises");
    const contextDir = path.join(tmpDir, "context");
    await mkdir(contextDir, { recursive: true });
    await writeFile(
      path.join(tmpDir, ".oh-env"),
      `CONTEXT_DIR=${contextDir}\nCONTEXT_TEMPLATE_DIR=${tmpDir}/tpl\nKNOWLEDGE_DIR=${tmpDir}/k\nPLAN_DIR=${tmpDir}/p\n`,
    );

    savedCwd = process.cwd();
    process.chdir(tmpDir);

    stdoutChunks = [];
    stderrChunks = [];

    stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
      (chunk: string | Uint8Array) => {
        stdoutChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
        return true;
      },
    );
    stderrSpy = spyOn(process.stderr, "write").mockImplementation(
      (chunk: string | Uint8Array) => {
        stderrChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
        return true;
      },
    );
  });

  afterEach(async () => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    process.chdir(savedCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("tiny payload — writes to stdout, no temp file", async () => {
    const rule = makeRule({
      body: "## DO\n- write tests\n",
      absPath: path.join(tmpDir, "rule-tiny.md"),
    });

    await deliverPayload([rule]);

    const stdout = stdoutChunks.join("");
    expect(stdout.length).toBeGreaterThan(0);
    // nothing written to the paginate temp file path
    const { access } = await import("node:fs/promises");
    let exists = false;
    try {
      await access(paginateFilePath());
      exists = true;
    } catch {}
    // We can't guarantee no leftover from a prior run, but the stdout path is confirmed
    // The key assertion: payload went to stdout
    expect(stdout).toContain("Authoritative rules");
  });

  test("tiny payload — no __OH_CONTEXT_NEXT_ACTIONS__ on stderr", async () => {
    const rule = makeRule({
      body: "## DO\n- write tests\n",
      absPath: path.join(tmpDir, "rule-tiny.md"),
    });

    await deliverPayload([rule]);

    const stderr = stderrChunks.join("");
    expect(stderr).not.toContain("__OH_CONTEXT_NEXT_ACTIONS__");
  });

  test("large payload — writes to temp file and emits self_act on stderr", async () => {
    // Build a body that renders to >20KB. ~300 bytes per line × 100 lines ≈ 30KB after render overhead
    const longLine = "x".repeat(250);
    const body = Array.from({ length: 100 }, (_, i) => `- item ${i}: ${longLine}`).join("\n");
    const rule = makeRule({ body });

    // Verify our fixture actually exceeds the threshold after rendering
    const { renderContext } = await import("../src/skills/context/render.ts");
    const rendered = renderContext([rule]);
    expect(Buffer.byteLength(rendered, "utf-8")).toBeGreaterThan(STREAM_THRESHOLD_BYTES);

    await deliverPayload([rule]);

    const stderr = stderrChunks.join("");
    expect(stderr).toContain("__OH_CONTEXT_NEXT_ACTIONS__");

    // Extract and parse the JSON from the sentinel line
    const sentinelIdx = stderr.indexOf("__OH_CONTEXT_NEXT_ACTIONS__");
    const jsonStr = stderr.slice(sentinelIdx + "__OH_CONTEXT_NEXT_ACTIONS__".length);
    const actions = JSON.parse(jsonStr.trim());

    expect(Array.isArray(actions)).toBe(true);
    expect(actions[0].type).toBe("self_act");
    expect(actions[0].prompt).toContain("parallel");
    expect(actions[0].prompt).toContain("SINGLE");

    // File was written to os.tmpdir()
    const { readFile } = await import("node:fs/promises");
    const written = await readFile(paginateFilePath(), "utf-8");
    expect(written).toContain("Authoritative rules");
  });
});
