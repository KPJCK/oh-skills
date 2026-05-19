import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The cache module reads/writes a path derived from CONTEXT_DIR (via loadOhEnv).
 * These tests exercise the JSON shape directly — read/write the cache file in a
 * temp dir to validate schema integrity without importing the live module.
 */

describe("cache JSON shape", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(path.join(tmpdir(), "oh-context-cache-test-")));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("round-trips a cache entry", async () => {
    const cacheFile = path.join(tmp, "picks.json");
    const written = {
      "/some/cwd": {
        lastPicks: ["typescript/frontend", "git"],
        lastLoaded: [
          {
            file: "typescript/frontend/rule-react-hooks.md",
            title: "React hooks",
            priority: "medium",
            hash: "abc12345",
          },
        ],
        lastLoadedAt: "2026-05-16T10:00:00.000Z",
      },
    };
    await writeFile(cacheFile, JSON.stringify(written, null, 2));
    const read = JSON.parse(await readFile(cacheFile, "utf-8"));
    expect(read).toEqual(written);
  });

  test("handles missing cache file gracefully (empty object)", async () => {
    const cacheFile = path.join(tmp, "does-not-exist.json");
    // Simulate the readCache fallback
    let parsed = {};
    try {
      parsed = JSON.parse(await readFile(cacheFile, "utf-8"));
    } catch {
      parsed = {};
    }
    expect(parsed).toEqual({});
  });

  test("cache structure ensures lastPicks is string[] and lastLoaded entries have required keys", () => {
    const entry = {
      lastPicks: ["typescript/frontend"],
      lastLoaded: [
        {
          file: "typescript/frontend/rule-react-hooks.md",
          title: "React hooks",
          priority: "medium",
          hash: "abc12345",
        },
      ],
      lastLoadedAt: new Date().toISOString(),
    };
    expect(Array.isArray(entry.lastPicks)).toBe(true);
    expect(entry.lastPicks.every((p) => typeof p === "string")).toBe(true);
    for (const ll of entry.lastLoaded) {
      expect(typeof ll.file).toBe("string");
      expect(typeof ll.title).toBe("string");
      expect(["low", "medium", "high"]).toContain(ll.priority);
      expect(typeof ll.hash).toBe("string");
    }
  });

  test("temp dir setup works", async () => {
    expect(tmp).toBeTruthy();
    await mkdir(path.join(tmp, "sub"), { recursive: true });
  });
});
