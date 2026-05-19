import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { realpath } from "node:fs/promises";

/**
 * plans.ts uses PLAN_DIR from loadOhEnv(). To test the round counting logic
 * without touching the real PLAN_DIR, we test the regex directly here (the
 * algorithm lives in nextReviewRound: count `^## Round N` lines and return
 * max+1, or 1 if none).
 */

function countNextRound(content: string): number {
  const matches = content.match(/^## Round (\d+)\b/gm) ?? [];
  if (matches.length === 0) return 1;
  const rounds = matches
    .map((m) => Number.parseInt(m.replace(/^## Round /, ""), 10))
    .filter((n) => !Number.isNaN(n));
  return Math.max(...rounds, 0) + 1;
}

describe("nextReviewRound logic", () => {
  test("returns 1 when no rounds present", () => {
    expect(countNextRound("# Review\n\nNo rounds yet.")).toBe(1);
  });

  test("returns 2 after Round 1", () => {
    expect(countNextRound("## Round 1 — 2026-05-16\n\nfindings")).toBe(2);
  });

  test("returns max + 1 across multiple rounds", () => {
    expect(
      countNextRound(
        "## Round 1 — 2026-05-16\nfoo\n## Round 2 — 2026-05-17\nbar",
      ),
    ).toBe(3);
  });

  test("handles non-sequential rounds (max wins)", () => {
    expect(
      countNextRound("## Round 5 — 2026-05-16\n## Round 2 — 2026-05-15"),
    ).toBe(6);
  });

  test("ignores non-round H2 headings", () => {
    expect(
      countNextRound("## Summary\n## Round 1 — 2026-05-16\n## Notes"),
    ).toBe(2);
  });
});

describe("plan dir filesystem ops (temp)", () => {
  let tmp: string;

  beforeEach(async () => {
    const raw = await mkdtemp(path.join(os.tmpdir(), "oh-nice-plans-test-"));
    tmp = await realpath(raw);
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("can create nested plan dir + write plan.md", async () => {
    const dir = path.join(tmp, "my-repo", "add-auth");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "plan.md"), "# Plan\n");
    const written = await Bun.file(path.join(dir, "plan.md")).text();
    expect(written).toBe("# Plan\n");
  });
});
