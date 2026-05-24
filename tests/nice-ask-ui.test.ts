import { test, expect, describe } from "bun:test";
import {
  buildPlanPickerAskPayload,
  buildScopePickerAskPayload,
  chunkBalanced,
} from "../src/skills/nice/ask-ui.ts";
import type { PlanInfo } from "../src/skills/nice/plans.ts";

function fakePlans(names: string[]): PlanInfo[] {
  return names.map((name) => ({
    name,
    mtime: new Date("2026-05-16T10:00:00Z"),
    hasSpec: false,
    hasPlan: true,
    hasReview: false,
  }));
}

describe("chunkBalanced (oh-nice)", () => {
  test("≤4 → single chunk", () => {
    expect(chunkBalanced([1, 2, 3, 4])).toEqual([[1, 2, 3, 4]]);
  });
  test("5 → [3, 2]", () => {
    expect(chunkBalanced([1, 2, 3, 4, 5])).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });
  test("never produces chunk with <2 items", () => {
    for (let n = 2; n <= 20; n++) {
      const chunks = chunkBalanced(Array.from({ length: n }, (_, i) => i));
      for (const c of chunks) expect(c.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("buildPlanPickerAskPayload", () => {
  test("0 plans → empty payload with helpful next", () => {
    const p = buildPlanPickerAskPayload([], "go");
    expect(p.questions).toEqual([]);
    expect(p.next).toContain("no plans");
  });

  test("1 plan → autoPick", () => {
    const p = buildPlanPickerAskPayload(fakePlans(["solo-plan"]), "go");
    expect(p.questions).toEqual([]);
    expect(p.autoPick).toEqual(["solo-plan"]);
    expect(p.next).toContain(`--slug "solo-plan"`);
  });

  test("review uses --plan flag, go uses --slug, fix uses --plan", () => {
    const reviewP = buildPlanPickerAskPayload(fakePlans(["x"]), "review");
    const goP = buildPlanPickerAskPayload(fakePlans(["x"]), "go");
    const fixP = buildPlanPickerAskPayload(fakePlans(["x"]), "fix");
    expect(reviewP.next).toContain("review --plan");
    expect(goP.next).toContain("go --slug");
    expect(fixP.next).toContain("fix --plan");
  });

  test("4 plans → single question, all 4", () => {
    const p = buildPlanPickerAskPayload(fakePlans(["a", "b", "c", "d"]), "go");
    expect(p.questions).toHaveLength(1);
    expect(p.questions[0]!.options).toHaveLength(4);
    expect(p.questions[0]!.multiSelect).toBe(false);
  });

  test("5 plans → 2 questions balanced 3+2", () => {
    const p = buildPlanPickerAskPayload(fakePlans(["a", "b", "c", "d", "e"]), "review");
    expect(p.questions).toHaveLength(2);
    expect(p.questions[0]!.options).toHaveLength(3);
    expect(p.questions[1]!.options).toHaveLength(2);
  });

  test("17 plans → tooManyForUI + plainText", () => {
    const p = buildPlanPickerAskPayload(
      fakePlans(Array.from({ length: 17 }, (_, i) => `plan-${i}`)),
      "go",
    );
    expect(p.questions).toEqual([]);
    expect(p.tooManyForUI).toBe(true);
    expect(p.plainText).toContain("1. plan-0");
    expect(p.plainText).toContain("17. plan-16");
  });

  test("plan description includes available files + date", () => {
    const plans: PlanInfo[] = [
      {
        name: "p",
        mtime: new Date("2026-05-16T00:00:00Z"),
        hasSpec: true,
        hasPlan: true,
        hasReview: true,
      },
    ];
    buildPlanPickerAskPayload(plans, "review");
    // autoPick path — no questions to inspect; verify other branch
    const plans4 = [...plans, ...plans, ...plans, ...plans].map((item, i) =>
      Object.assign({}, item, { name: `p${i}` }),
    );
    const p2 = buildPlanPickerAskPayload(plans4, "review");
    const opt = p2.questions[0]!.options[0]!;
    expect(opt.description).toContain("plan+review+spec");
    expect(opt.description).toContain("2026-05-16");
  });

  test("plan picker is always single-select (you pick ONE plan)", () => {
    for (const n of [2, 4, 5, 8, 16]) {
      const p = buildPlanPickerAskPayload(
        fakePlans(Array.from({ length: n }, (_, i) => `p${i}`)),
        "go",
      );
      for (const q of p.questions) {
        expect(q.multiSelect).toBe(false);
      }
    }
  });
});

describe("buildScopePickerAskPayload", () => {
  test("always returns one single-select question with 3 options", () => {
    const p = buildScopePickerAskPayload();
    expect(p.questions).toHaveLength(1);
    expect(p.questions[0]!.multiSelect).toBe(false);
    expect(p.questions[0]!.options).toHaveLength(3);
    expect(p.questions[0]!.options.map((o) => o.label)).toEqual([
      "branch",
      "uncommitted",
      "last-n",
    ]);
  });
});
