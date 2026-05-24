import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { loadState, saveState, clearState } from "../src/skills/nice/go-state.ts";

let tmp: string;

beforeEach(async () => {
  const raw = await mkdtemp(path.join(os.tmpdir(), "oh-go-state-test-"));
  tmp = await realpath(raw);
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("go-state", () => {
  test("loadState returns null when no state file exists", async () => {
    expect(await loadState(tmp)).toBeNull();
  });

  test("saveState then loadState returns the same state", async () => {
    await saveState(tmp, { done: ["a", "b"], startedAt: "2026-05-24T00:00:00Z" });
    const loaded = await loadState(tmp);
    expect(loaded).toEqual({
      done: ["a", "b"],
      startedAt: "2026-05-24T00:00:00Z",
    });
  });

  test("clearState removes the state file", async () => {
    await saveState(tmp, { done: ["a"], startedAt: "2026-05-24T00:00:00Z" });
    expect(await loadState(tmp)).not.toBeNull();
    await clearState(tmp);
    expect(await loadState(tmp)).toBeNull();
  });

  test("clearState is a no-op when no state file exists", async () => {
    await clearState(tmp); // should not throw
    expect(await loadState(tmp)).toBeNull();
  });
});
