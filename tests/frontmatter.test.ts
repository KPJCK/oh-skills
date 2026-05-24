import { test, expect, describe } from "bun:test";
import { parseRule, parseKnowledge, priorityRank, todayISO } from "../src/shared/frontmatter";

// ---------------------------------------------------------------------------
// parseRule (ported from oh-context/tests/frontmatter.test.ts)
// ---------------------------------------------------------------------------

describe("parseRule", () => {
  test("parses required fields", () => {
    const md = `---
title: Test rule
description: A demo
priority: high
---

# Test rule

## DO

- x
`;
    const { meta, body } = parseRule(md);
    expect(meta.title).toBe("Test rule");
    expect(meta.description).toBe("A demo");
    expect(meta.priority).toBe("high");
    expect(body).toContain("# Test rule");
    expect(body).toContain("## DO");
  });

  test("defaults priority to medium when omitted", () => {
    const md = `---
title: T
description: D
---

body
`;
    const { meta } = parseRule(md);
    expect(meta.priority).toBe("medium");
  });

  test("strips inline comments", () => {
    const md = `---
title: T
description: D
priority: low # this is the lowest
---

body
`;
    const { meta } = parseRule(md);
    expect(meta.priority).toBe("low");
  });

  test("throws on missing required field (title)", () => {
    const md = `---
description: D
---

body
`;
    expect(() => parseRule(md)).toThrow(/title/);
  });

  test("throws on missing required field (description)", () => {
    const md = `---
title: T
---

body
`;
    expect(() => parseRule(md)).toThrow(/description/);
  });

  test("throws on missing frontmatter", () => {
    expect(() => parseRule("just markdown body")).toThrow(/frontmatter/);
  });

  test("throws on invalid priority", () => {
    const md = `---
title: T
description: D
priority: critical
---

body
`;
    expect(() => parseRule(md)).toThrow(/invalid priority/);
  });

  test("strips single quotes around values", () => {
    const md = `---
title: 'Single quoted'
description: D
---

body
`;
    const { meta } = parseRule(md);
    expect(meta.title).toBe("Single quoted");
  });
});

// ---------------------------------------------------------------------------
// priorityRank (ported from oh-context/tests/frontmatter.test.ts)
// ---------------------------------------------------------------------------

describe("priorityRank", () => {
  test("orders high < medium < low (high wins → smaller rank)", () => {
    expect(priorityRank("high")).toBeLessThan(priorityRank("medium"));
    expect(priorityRank("medium")).toBeLessThan(priorityRank("low"));
  });
});

// ---------------------------------------------------------------------------
// parseKnowledge (ported from oh-search/tests/frontmatter.test.ts)
// ---------------------------------------------------------------------------

describe("parseKnowledge", () => {
  test("parses required fields + defaults", () => {
    const md = `---
title: Bun SQLite
summary: Database basics
topic: bun
created: 2026-05-16
updated: 2026-05-16
---

# Body
`;
    const { meta, body } = parseKnowledge(md);
    expect(meta.title).toBe("Bun SQLite");
    expect(meta.summary).toBe("Database basics");
    expect(meta.topic).toBe("bun");
    expect(meta.tags).toEqual([]);
    expect(meta.sources).toEqual([]);
    expect(meta.query).toBe("");
    expect(meta.created).toBe("2026-05-16");
    expect(meta.updated).toBe("2026-05-16");
    expect(body).toContain("# Body");
  });

  test("parses inline tag list", () => {
    const md = `---
title: T
summary: S
topic: t
tags: [a, b, c]
created: 2026-05-16
updated: 2026-05-16
---

body
`;
    const { meta } = parseKnowledge(md);
    expect(meta.tags).toEqual(["a", "b", "c"]);
  });

  test("parses block sources list", () => {
    const md = `---
title: T
summary: S
topic: t
sources:
  - https://example.com/one
  - "https://example.com/two"
created: 2026-05-16
updated: 2026-05-16
---

body
`;
    const { meta } = parseKnowledge(md);
    expect(meta.sources).toEqual(["https://example.com/one", "https://example.com/two"]);
  });

  test("throws on missing required fields", () => {
    const md = `---
title: T
---

body
`;
    expect(() => parseKnowledge(md)).toThrow();
  });

  test("throws on missing frontmatter", () => {
    expect(() => parseKnowledge("just body")).toThrow(/frontmatter/);
  });
});

// ---------------------------------------------------------------------------
// todayISO (ported from oh-search/tests/frontmatter.test.ts)
// ---------------------------------------------------------------------------

describe("todayISO", () => {
  test("returns YYYY-MM-DD format", () => {
    const v = todayISO();
    expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
