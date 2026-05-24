/**
 * Tests for src/shared/ask-ui.ts
 *
 * Ported from ~/.claude/skills/oh-context/tests/ask-ui.test.ts (18 tests).
 *
 * The original tests exercised `buildLoadAskPayload`, a folder-picker wrapper around the
 * generic payload builder. We replicate that wrapper here as a test-only helper to preserve
 * full behavioral coverage without pulling in oh-context-specific imports.
 */

import { test, expect, describe } from "bun:test";
import { bucketOptions, buildAskPayload } from "../src/shared/ask-ui.ts";
import type { AskOption, AskPayload } from "../src/shared/ask-ui.ts";

// ---------------------------------------------------------------------------
// Test-only FolderInfo type and buildLoadAsk wrapper
// (mirrors oh-context's buildLoadAskPayload so we can reuse the original tests)
// ---------------------------------------------------------------------------

type FolderInfo = { rel: string; ruleCount: number };

function fakeFolders(names: string[], ruleCount = 1): FolderInfo[] {
  return names.map((rel) => ({ rel, ruleCount }));
}

/**
 * Test-only wrapper that replicates oh-context's buildLoadAskPayload using buildAskPayload.
 * Synthesizes AskOptions from FolderInfo[], appending "last loaded" and token hints to
 * the description — matching the shape the original tests assert against.
 */
function buildLoadAsk(
  folders: readonly FolderInfo[],
  lastPicks: readonly string[] = [],
  folderTokens: ReadonlyMap<string, number> = new Map(),
): AskPayload {
  const next = `bun ~/.claude/skills/oh-context/cli.ts load --pick "<comma-separated labels>"`;

  if (folders.length === 0) {
    return {
      questions: [],
      next: "(no folders available — nothing to load)",
    };
  }

  if (folders.length === 1) {
    const only = folders[0]!;
    return {
      questions: [],
      next: `bun ~/.claude/skills/oh-context/cli.ts load --pick "${only.rel}"`,
      autoPick: [only.rel],
    };
  }

  const options: AskOption[] = folders.map((f) => {
    const ruleBit = `${f.ruleCount} rule${f.ruleCount === 1 ? "" : "s"}`;
    const tokBit = folderTokens.has(f.rel) ? ` · ${formatTokens(folderTokens.get(f.rel)!)}` : "";
    const lastBit = lastPicks.includes(f.rel) ? " · last loaded" : "";
    return { label: f.rel, description: `${ruleBit}${tokBit}${lastBit}` };
  });

  return buildAskPayload({
    options,
    questionPrefix: "Which context folders should I load?",
    header: "Context",
    multiSelect: true,
    next,
    plainTextRenderer: (opts) =>
      opts
        .map(
          (o, i) =>
            `${i + 1}. ${o.rel ?? o.label}  (${folders[i]!.ruleCount} rule${folders[i]!.ruleCount === 1 ? "" : "s"})${lastPicks.includes(o.label) ? "  ← last loaded" : ""}`,
        )
        .join("\n"),
  });
}

/** Minimal token formatter matching oh-context's formatTokens behaviour for tests. */
function formatTokens(n: number): string {
  if (n >= 1000) return `~${Math.round(n / 100) / 10}k tok`;
  return `~${n} tok`;
}

// ---------------------------------------------------------------------------
// bucketOptions (was chunkBalanced in oh-context)
// ---------------------------------------------------------------------------

describe("bucketOptions", () => {
  test("≤4 items → single chunk", () => {
    expect(bucketOptions([1, 2, 3])).toEqual([[1, 2, 3]]);
    expect(bucketOptions([1, 2, 3, 4])).toEqual([[1, 2, 3, 4]]);
  });

  test("5 items → [3, 2] (rebalanced from [4, 1])", () => {
    expect(bucketOptions([1, 2, 3, 4, 5])).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  test("6 items → [4, 2]", () => {
    expect(bucketOptions([1, 2, 3, 4, 5, 6])).toEqual([
      [1, 2, 3, 4],
      [5, 6],
    ]);
  });

  test("8 items → [4, 4]", () => {
    expect(bucketOptions([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
  });

  test("9 items → [4, 3, 2] (rebalanced from [4, 4, 1])", () => {
    expect(bucketOptions([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7],
      [8, 9],
    ]);
  });

  test("16 items → 4 chunks of 4 (no rebalance)", () => {
    const items = Array.from({ length: 16 }, (_, i) => i);
    const chunks = bucketOptions(items);
    expect(chunks).toHaveLength(4);
    expect(chunks.every((c) => c.length === 4)).toBe(true);
  });

  test("never produces a chunk with <2 items", () => {
    for (let n = 2; n <= 30; n++) {
      const items = Array.from({ length: n }, (_, i) => i);
      const chunks = bucketOptions(items);
      for (const c of chunks) {
        expect(c.length).toBeGreaterThanOrEqual(2);
        expect(c.length).toBeLessThanOrEqual(4);
      }
      // No items lost
      expect(chunks.flat()).toHaveLength(n);
    }
  });
});

// ---------------------------------------------------------------------------
// buildLoadAsk (wrapper tests — preserve full oh-context coverage)
// ---------------------------------------------------------------------------

describe("buildLoadAskPayload", () => {
  test("0 folders → empty payload", () => {
    const p = buildLoadAsk([]);
    expect(p.questions).toEqual([]);
    expect(p.autoPick).toBeUndefined();
    expect(p.tooManyForUI).toBeUndefined();
  });

  test("1 folder → autoPick, no question", () => {
    const p = buildLoadAsk(fakeFolders(["git"]));
    expect(p.questions).toEqual([]);
    expect(p.autoPick).toEqual(["git"]);
    expect(p.next).toContain(`--pick "git"`);
  });

  test("4 folders → single question with all 4", () => {
    const p = buildLoadAsk(fakeFolders(["git", "rust", "typescript", "typescript/frontend"]));
    expect(p.questions).toHaveLength(1);
    expect(p.questions[0]!.options).toHaveLength(4);
    expect(p.questions[0]!.multiSelect).toBe(true);
    expect(p.questions[0]!.options.map((o) => o.label)).toEqual([
      "git",
      "rust",
      "typescript",
      "typescript/frontend",
    ]);
  });

  test("5 folders → 2 questions, balanced as 3+2 (the bug scenario)", () => {
    const p = buildLoadAsk(
      fakeFolders(["git", "rust", "typescript", "typescript/backend", "typescript/frontend"]),
    );
    expect(p.questions).toHaveLength(2);
    expect(p.questions[0]!.options).toHaveLength(3);
    expect(p.questions[1]!.options).toHaveLength(2);
    // All 5 folders are represented (no drops)
    const allLabels = p.questions.flatMap((q) => q.options.map((o) => o.label));
    expect(allLabels.sort()).toEqual([
      "git",
      "rust",
      "typescript",
      "typescript/backend",
      "typescript/frontend",
    ]);
  });

  test("16 folders → 4 questions × 4 options each, no overflow", () => {
    const folders = fakeFolders(Array.from({ length: 16 }, (_, i) => `topic-${i}`));
    const p = buildLoadAsk(folders);
    expect(p.questions).toHaveLength(4);
    expect(p.questions.every((q) => q.options.length === 4)).toBe(true);
    expect(p.tooManyForUI).toBeUndefined();
  });

  test("17 folders → tooManyForUI + plainText fallback", () => {
    const folders = fakeFolders(Array.from({ length: 17 }, (_, i) => `topic-${i}`));
    const p = buildLoadAsk(folders);
    expect(p.questions).toEqual([]);
    expect(p.tooManyForUI).toBe(true);
    expect(p.plainText).toBeDefined();
    expect(p.plainText).toContain("1. topic-0");
    expect(p.plainText).toContain("17. topic-16");
  });

  test("last-picks hint appears in description", () => {
    const p = buildLoadAsk(fakeFolders(["git", "rust"]), ["git"]);
    expect(p.questions).toHaveLength(1);
    const gitOpt = p.questions[0]!.options.find((o) => o.label === "git");
    const rustOpt = p.questions[0]!.options.find((o) => o.label === "rust");
    expect(gitOpt!.description).toContain("last loaded");
    expect(rustOpt!.description).not.toContain("last loaded");
  });

  test("rule count appears in description", () => {
    const folders: FolderInfo[] = [
      { rel: "git", ruleCount: 1 },
      { rel: "rust", ruleCount: 3 },
    ];
    const p = buildLoadAsk(folders);
    const opts = p.questions[0]!.options;
    expect(opts.find((o) => o.label === "git")!.description).toContain("1 rule");
    expect(opts.find((o) => o.label === "rust")!.description).toContain("3 rules");
  });

  test("multiSelect is always true for load picker", () => {
    for (const n of [2, 4, 5, 8, 16]) {
      const p = buildLoadAsk(fakeFolders(Array.from({ length: n }, (_, i) => `f${i}`)));
      for (const q of p.questions) {
        expect(q.multiSelect).toBe(true);
      }
    }
  });

  test("header is short for single-question", () => {
    const p = buildLoadAsk(fakeFolders(["a", "b", "c"]));
    expect(p.questions[0]!.header.length).toBeLessThanOrEqual(12);
  });

  test("header carries pagination info for multi-question", () => {
    const p = buildLoadAsk(fakeFolders(["a", "b", "c", "d", "e", "f"]));
    expect(p.questions[0]!.header).toContain("1/2");
    expect(p.questions[1]!.header).toContain("2/2");
  });
});
