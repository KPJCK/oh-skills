import { test, expect, describe } from "bun:test";
import { score, rankAndFilter } from "../src/skills/search/scoring.ts";
import type { Knowledge } from "../src/skills/search/registry.ts";

function fakeKnowledge(overrides: Partial<Knowledge["meta"]> & { name?: string }): Knowledge {
  const name = overrides.name ?? "test";
  const { name: _ignored, ...metaOverrides } = overrides;
  return {
    meta: {
      title: "T",
      summary: "S",
      topic: "t",
      tags: [],
      sources: [],
      query: "",
      created: "2026-05-16",
      updated: "2026-05-16",
      ...metaOverrides,
    } as Knowledge["meta"],
    topic: metaOverrides.topic ?? "t",
    name,
    shape: "simple",
    absPath: `/fake/${name}.md`,
    rel: `t/search-${name}.md`,
    absRoot: `/fake/${name}.md`,
    body: "",
  };
}

describe("scoring.score", () => {
  test("title term match scores 5", () => {
    const k = fakeKnowledge({ title: "Bun SQLite API" });
    expect(score("bun", k)).toBeGreaterThanOrEqual(5);
  });

  test("summary term match scores 3", () => {
    const k = fakeKnowledge({ title: "X", summary: "How to use sqlite" });
    // sqlite hits summary (+3) + exact phrase match in summary (+2) = 5
    expect(score("sqlite", k)).toBeGreaterThanOrEqual(3);
  });

  test("tag exact match scores 3", () => {
    const k = fakeKnowledge({ tags: ["sqlite", "database"] });
    expect(score("sqlite", k)).toBeGreaterThanOrEqual(3);
  });

  test("topic match scores 2", () => {
    const k = fakeKnowledge({ topic: "bun" });
    expect(score("bun", k)).toBeGreaterThanOrEqual(2);
  });

  test("exact phrase in title adds bonus", () => {
    const k1 = fakeKnowledge({ title: "Bun SQLite API" });
    const k2 = fakeKnowledge({ title: "Random Bun SQLite stuff API" });
    // Both have "bun" and "sqlite" tokens; k1 has exact phrase "bun sqlite api" → higher
    expect(score("bun sqlite api", k1)).toBeGreaterThan(score("bun sqlite api", k2));
  });

  test("ignores stop words", () => {
    const k = fakeKnowledge({ title: "The Bun Runtime" });
    // "the" is a stop word; only "bun" and "runtime" should count
    const s = score("the", k);
    expect(s).toBe(0);
  });

  test("zero when no terms match", () => {
    const k = fakeKnowledge({ title: "React hooks", summary: "Frontend stuff" });
    expect(score("rust async", k)).toBe(0);
  });

  test("filename exact match scores 5 even when content doesn't mention the slug", () => {
    const k = fakeKnowledge({
      name: "oh-series",
      title: "Some unrelated title",
      summary: "Unrelated summary",
    });
    expect(score("oh-series", k)).toBeGreaterThanOrEqual(5);
  });

  test("filename substring match scores 2", () => {
    const k = fakeKnowledge({
      name: "react-hooks-rules",
      title: "X",
      summary: "Y",
    });
    expect(score("hooks", k)).toBeGreaterThanOrEqual(2);
  });

  test("space-to-hyphen normalization in query", () => {
    const k = fakeKnowledge({ name: "oh-series", title: "X", summary: "Y" });
    expect(score("oh series", k)).toBeGreaterThanOrEqual(5);
  });
});

describe("scoring.rankAndFilter", () => {
  const all = [
    fakeKnowledge({ name: "react", title: "React Server Components", topic: "react", tags: ["react", "rsc"] }),
    fakeKnowledge({ name: "bun", title: "Bun SQLite API", topic: "bun", tags: ["sqlite"] }),
    fakeKnowledge({ name: "rust", title: "Rust async patterns", topic: "rust" }),
  ];

  test("ranks top match first", () => {
    const ranked = rankAndFilter("react server components", all);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]!.knowledge.name).toBe("react");
  });

  test("filters below threshold", () => {
    const ranked = rankAndFilter("kubernetes", all, { threshold: 2 });
    expect(ranked).toEqual([]);
  });

  test("respects limit", () => {
    const ranked = rankAndFilter("react bun rust", all, { threshold: 0, limit: 2 });
    expect(ranked.length).toBeLessThanOrEqual(2);
  });
});
