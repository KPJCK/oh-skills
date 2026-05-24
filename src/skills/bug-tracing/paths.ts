// src/skills/bug-tracing/paths.ts
//
// Resolves the trace.md output path for a given bug slug.
// Reuses the plan-dir convention: $PLAN_DIR/<repo>/<slug>/trace.md

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { loadOhEnv } from "../../env";
import { detectRepo } from "../nice/repo";

export type TracePaths = {
  dir: string;
  traceMd: string;
};

export function tracePaths(planDir: string, repo: string, slug: string): TracePaths {
  const dir = path.join(planDir, repo, slug);
  return {
    dir,
    traceMd: path.join(dir, "trace.md"),
  };
}

export async function resolveTracePaths(slug: string): Promise<TracePaths> {
  const env = loadOhEnv();
  const { repo } = await detectRepo();
  const paths = tracePaths(env.PLAN_DIR, repo, slug);
  await mkdir(paths.dir, { recursive: true });
  return paths;
}

/**
 * Derive a URL-safe slug from the first 5–6 words of a bug description.
 * Lowercases, strips non-alphanumeric chars, joins with hyphens.
 */
export function slugFromDescription(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  const slug = words.join("-");
  // ensure at least 2 chars (bug descriptions are always longer than 1 word in practice)
  if (slug.length < 2) return "bug-fix";
  return slug;
}
