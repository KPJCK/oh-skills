import { stat, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadOhEnv } from "../../env.ts";
import type { Slug } from "./prompts.ts";

function planRoot(): string {
  return loadOhEnv().PLAN_DIR;
}

export type PlanPaths = {
  dir: string;
  specMd: string;
  planMd: string;
  reviewMd: string;
};

export type PlanInfo = {
  name: string;
  mtime: Date;
  hasSpec: boolean;
  hasPlan: boolean;
  hasReview: boolean;
};

export function planPaths(repo: string, slug: string): PlanPaths {
  const dir = path.join(planRoot(), repo, slug);
  return {
    dir,
    specMd: path.join(dir, "spec.md"),
    planMd: path.join(dir, "plan.md"),
    reviewMd: path.join(dir, "review.md"),
  };
}

export async function listPlans(repo: string): Promise<PlanInfo[]> {
  const repoDir = path.join(planRoot(), repo);
  let entries: string[];
  try {
    entries = await readdir(repoDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const plans: PlanInfo[] = [];
  for (const name of entries) {
    const dir = path.join(repoDir, name);
    let dirStat;
    try {
      dirStat = await stat(dir);
    } catch {
      continue;
    }
    if (!dirStat.isDirectory()) continue;

    const paths = planPaths(repo, name);
    plans.push({
      name,
      mtime: dirStat.mtime,
      hasSpec: await fileExists(paths.specMd),
      hasPlan: await fileExists(paths.planMd),
      hasReview: await fileExists(paths.reviewMd),
    });
  }
  plans.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return plans;
}

export async function createPlanDir(repo: string, slug: Slug): Promise<PlanPaths> {
  const paths = planPaths(repo, slug);
  if (await fileExists(paths.planMd)) {
    throw new Error(
      `plan already exists at ${paths.planMd} — refusing to overwrite. pick a different slug or delete the existing plan first.`,
    );
  }
  await mkdir(paths.dir, { recursive: true });
  return paths;
}

export async function nextReviewRound(repo: string, slug: string): Promise<number> {
  const { reviewMd } = planPaths(repo, slug);
  if (!(await fileExists(reviewMd))) return 1;
  const content = await readFile(reviewMd, "utf-8");
  // count lines matching `## Round N`
  const matches = content.match(/^## Round (\d+)\b/gm) ?? [];
  if (matches.length === 0) return 1;
  const rounds = matches
    .map((m) => Number.parseInt(m.replace(/^## Round /, ""), 10))
    .filter((n) => !Number.isNaN(n));
  return Math.max(...rounds, 0) + 1;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
