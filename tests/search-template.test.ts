import { test, expect, describe } from "bun:test";
import { scaffoldKnowledge, slugify } from "../src/skills/search/template.ts";

describe("slugify", () => {
  test("basic lowercase-kebab", () => {
    expect(slugify("React Hooks Conventions")).toBe("react-hooks-conventions");
  });

  test("strips special characters", () => {
    expect(slugify("Async/Await patterns!")).toBe("asyncawait-patterns");
  });

  test("collapses multiple spaces and hyphens", () => {
    expect(slugify("a   b---c")).toBe("a-b-c");
  });

  test("trims leading and trailing hyphens", () => {
    expect(slugify("  -hello-  ")).toBe("hello");
  });

  test("empty for all-special input", () => {
    expect(slugify("!@#$%")).toBe("");
  });
});

describe("scaffoldKnowledge", () => {
  test("produces valid frontmatter + body", () => {
    const out = scaffoldKnowledge({
      title: "Test",
      summary: "A test",
      topic: "test",
      body: "# Test\n\ncontent",
    });
    expect(out).toContain("---");
    expect(out).toContain("title: Test");
    expect(out).toContain("summary: A test");
    expect(out).toContain("topic: test");
    expect(out).toContain("tags: []");
    expect(out).toContain("sources: []");
    expect(out).toContain("created: ");
    expect(out).toContain("updated: ");
    expect(out).toContain("# Test");
  });

  test("renders inline tags array", () => {
    const out = scaffoldKnowledge({
      title: "T",
      summary: "S",
      topic: "t",
      tags: ["a", "b"],
      body: "body",
    });
    expect(out).toContain("tags: [a, b]");
  });

  test("renders block sources list", () => {
    const out = scaffoldKnowledge({
      title: "T",
      summary: "S",
      topic: "t",
      sources: ["https://example.com/one", "https://example.com/two"],
      body: "body",
    });
    expect(out).toMatch(/sources:\n  - "?https:\/\/example\.com\/one"?/);
  });

  test("prepends # Title heading if body lacks one", () => {
    const out = scaffoldKnowledge({
      title: "My Title",
      summary: "S",
      topic: "t",
      body: "just some text, no heading",
    });
    expect(out).toContain("# My Title");
  });

  test("does not double the heading if body already has one", () => {
    const out = scaffoldKnowledge({
      title: "My Title",
      summary: "S",
      topic: "t",
      body: "# Already Has Heading\n\ncontent",
    });
    expect((out.match(/^# /gm) ?? []).length).toBe(1);
  });

  test("quotes values with YAML-significant chars", () => {
    const out = scaffoldKnowledge({
      title: "T",
      summary: "S",
      topic: "t",
      sources: ["https://example.com/path?q=1"],
      body: "body",
    });
    expect(out).toContain('"https://example.com/path?q=1"');
  });
});
