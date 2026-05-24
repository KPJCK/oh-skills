// src/skills/nice/go-state.ts
//
// Sidecar state file for the parallel `oh-nice go` runner.
// Lives at <plan-dir>/.oh-nice/go-state.json — created on phase=init,
// updated on each phase=wave-done, removed on all-complete or --reset.

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const STATE_DIR = ".oh-nice";
const STATE_FILE = "go-state.json";

export type GoState = {
  done: string[];
  startedAt: string; // ISO 8601
};

function stateDir(planDir: string): string {
  return path.join(planDir, STATE_DIR);
}

function statePath(planDir: string): string {
  return path.join(stateDir(planDir), STATE_FILE);
}

export async function loadState(planDir: string): Promise<GoState | null> {
  const p = statePath(planDir);
  try {
    const text = await readFile(p, "utf-8");
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.done)) return null;
    if (typeof parsed.startedAt !== "string") return null;
    return { done: parsed.done.map(String), startedAt: parsed.startedAt };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveState(planDir: string, state: GoState): Promise<void> {
  await mkdir(stateDir(planDir), { recursive: true });
  await writeFile(statePath(planDir), JSON.stringify(state, null, 2) + "\n", "utf-8");
}

export async function clearState(planDir: string): Promise<void> {
  await rm(statePath(planDir), { force: true });
}
