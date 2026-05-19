import { $ } from "bun";
import { listPlans, type PlanInfo } from "./plans.ts";
import { select } from "./prompts.ts";
import { c, info } from "../../shared/ui.ts";

export type PickerOptions = {
  filter?: (plan: PlanInfo) => boolean;
  prompt?: string;
};

export async function pickPlan(
  repo: string,
  opts: PickerOptions = {},
): Promise<string | null> {
  const all = await listPlans(repo);
  const plans = opts.filter ? all.filter(opts.filter) : all;

  if (plans.length === 0) return null;

  const fzfAvailable = await hasFzf();
  if (fzfAvailable) {
    return await fzfPick(plans, opts.prompt ?? "plan> ");
  }
  return await inquirerPick(plans, opts.prompt ?? "Select a plan");
}

async function hasFzf(): Promise<boolean> {
  try {
    await $`which fzf`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function fzfPick(
  plans: PlanInfo[],
  prompt: string,
): Promise<string | null> {
  const lines = plans.map((p) => formatPlanLine(p)).join("\n");
  try {
    const result = await $`echo ${lines} | fzf --ansi --prompt=${prompt} --height=40% --reverse --no-mouse`.text();
    const picked = result.trim();
    if (!picked) return null;
    // first column up to first whitespace = plan name (we render name then padding)
    const name = picked.split(/\s{2,}/)[0]?.trim();
    return name ?? null;
  } catch {
    // fzf exits non-zero on cancel
    return null;
  }
}

async function inquirerPick(
  plans: PlanInfo[],
  message: string,
): Promise<string | null> {
  const choices = plans.map((p) => ({
    name: formatPlanLine(p, { plain: true }),
    value: p.name,
  }));
  try {
    return await select({ message, choices });
  } catch {
    return null;
  }
}

function formatPlanLine(p: PlanInfo, opts: { plain?: boolean } = {}): string {
  const flags = [
    p.hasPlan ? "plan" : "",
    p.hasReview ? "review" : "",
    p.hasSpec ? "spec" : "",
  ]
    .filter(Boolean)
    .join("+");
  const date = p.mtime.toISOString().slice(0, 10);
  const namePart = opts.plain ? p.name : c.bold(p.name);
  const metaPart = opts.plain
    ? `${date}  [${flags}]`
    : `${c.dim(date)}  ${c.hint(`[${flags}]`)}`;
  return `${namePart.padEnd(40)}  ${metaPart}`;
}

// Re-export for callers that want to print "no plans found"
export { info };
