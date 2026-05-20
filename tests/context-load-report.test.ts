import { test, expect, describe } from "bun:test";
import { renderLoadReport } from "../src/skills/context/render.ts";
import type { Rule } from "../src/skills/context/registry.ts";

function fakeRule(folder: string): Rule {
  // The renderer only reads `folder`; cast a minimal shape for unit testing.
  return { folder } as Rule;
}

describe("renderLoadReport", () => {
  test("first load (sessionBaseline=null) renders banner with folders in pick order and no (new) markers", () => {
    const rules: Rule[] = [
      fakeRule("typescript"),
      fakeRule("typescript"),
      fakeRule("typescript/frontend"),
      fakeRule("typescript/frontend"),
      fakeRule("typescript/frontend"),
    ];
    const out = renderLoadReport({
      picked: ["typescript", "typescript/frontend"],
      rules,
      sessionBaseline: null,
    });
    expect(out).toBe(
      [
        "===================================",
        "||        Context Loaded",
        "===================================",
        "[typescript]: 2 rules",
        "[typescript/frontend]: 3 rules",
      ].join("\n"),
    );
  });

  test("subsequent load: folders not in baseline rendered after baseline with (new) suffix", () => {
    const rules: Rule[] = [
      fakeRule("typescript"),
      fakeRule("typescript/frontend"),
      fakeRule("git"),
      ...Array.from({ length: 4 }, () => fakeRule("rust")),
    ];
    const out = renderLoadReport({
      picked: ["typescript", "typescript/frontend", "git", "rust"],
      rules,
      sessionBaseline: ["typescript", "typescript/frontend"],
    });
    expect(out).toBe(
      [
        "===================================",
        "||        Context Loaded",
        "===================================",
        "[typescript]: 1 rule",
        "[typescript/frontend]: 1 rule",
        "[git]: 1 rule (new)",
        "[rust]: 4 rules (new)",
      ].join("\n"),
    );
  });
});
