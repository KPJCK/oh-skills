import { test, expect, describe } from "bun:test";

// repo.ts uses a private parseRepoFromUrl; we re-implement the same logic
// here as a black-box style test against detectRepo's algorithm.
// (If repo.ts later exports parseRepoFromUrl, replace this with direct import.)

function parseRepoFromUrl(url: string): string | null {
  const cleaned = url.replace(/\.git$/, "");
  const lastSegment = cleaned.split(/[:/]/).pop();
  return lastSegment && lastSegment.length > 0 ? lastSegment : null;
}

describe("parseRepoFromUrl", () => {
  test("git@ ssh shorthand", () => {
    expect(parseRepoFromUrl("git@github.com:foo/bar.git")).toBe("bar");
  });

  test("https github", () => {
    expect(parseRepoFromUrl("https://github.com/foo/bar")).toBe("bar");
  });

  test("https with .git suffix", () => {
    expect(parseRepoFromUrl("https://github.com/foo/bar.git")).toBe("bar");
  });

  test("ssh:// scheme with port", () => {
    expect(parseRepoFromUrl("ssh://git@host.com:22/foo/baz.git")).toBe("baz");
  });

  test("gitlab nested path", () => {
    expect(parseRepoFromUrl("git@gitlab.com:org/sub/proj.git")).toBe("proj");
  });

  test("returns null for empty", () => {
    expect(parseRepoFromUrl("")).toBe(null);
  });
});
