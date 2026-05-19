import { readFile, writeFile, stat } from "node:fs/promises";
import { rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { $ } from "bun";
import { detectRepo } from "../repo.ts";
import { planPaths, listPlans } from "../plans.ts";
import { pickPlan } from "../picker.ts";
import { asSlug } from "../prompts.ts";
import { buildPlanPickerAskPayload } from "../ask-ui.ts";
import { banner, step, success, info, hint, error } from "../ui.ts";
import { banner as sharedBanner } from "../../../shared/banner.ts";
import { PRESETS } from "../../../shared/banner-presets.ts";
import { emit, type NextAction } from "../../../shared/next-action.ts";

const CLI = "${CLAUDE_PLUGIN_ROOT}/src/cli.ts";

type Phase = "init" | "post-brainstorm" | "post-plan";

export async function run(args: string[]): Promise<void> {
  let phase: Phase = "init";
  const rest: string[] = [];
  for (const a of args) {
    if (a.startsWith("--phase=")) {
      const v = a.slice("--phase=".length);
      if (v !== "init" && v !== "post-brainstorm" && v !== "post-plan") {
        throw new Error(`unknown phase: ${v}`);
      }
      phase = v;
    } else {
      rest.push(a);
    }
  }
  switch (phase) {
    case "init":
      return phaseInit(rest);
    case "post-brainstorm":
      return phasePostBrainstorm(rest);
    case "post-plan":
      return phasePostPlan(rest);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 1: init
// ──────────────────────────────────────────────────────────────────────────────

async function phaseInit(rest: string[]): Promise<void> {
  let slug: string | undefined;
  let emitAskJson = false;
  const reqParts: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--slug") slug = rest[++i];
    else if (a.startsWith("--slug=")) slug = a.slice("--slug=".length);
    else if (a === "--emit-ask-json") emitAskJson = true;
    else reqParts.push(a);
  }
  const request = reqParts.join(" ").trim();

  const { repo } = await detectRepo();

  if (emitAskJson) {
    const plans = (await listPlans(repo)).filter((p) => p.hasPlan);
    const payload = buildPlanPickerAskPayload(plans, "update-plan");
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  sharedBanner({ ...PRESETS.niceUpdate, subtitle: `Repo: ${repo}  •  Iterating an existing plan (new ideas / improvements / feedback)` });

  // pick plan
  step(1, 3, "Pick a plan to update");
  let pickedSlug: string;
  if (slug) {
    pickedSlug = asSlug(slug);
    info(`using --slug ${pickedSlug}`);
  } else {
    const plans = (await listPlans(repo)).filter((p) => p.hasPlan);
    if (plans.length === 0) {
      error("no plans with plan.md found for this repo", "run /oh-nice plan first");
      emit("nice", [{ type: "report", message: "no updatable plans — exiting" }]);
      return;
    }
    if (!process.stdin.isTTY) {
      error(
        "interactive plan picker requires a TTY",
        `pass --slug <slug>. Available: ${plans.map((p) => p.name).join(", ")}`,
      );
      process.exit(2);
    }
    const picked = await pickPlan(repo, { filter: (p) => p.hasPlan });
    if (!picked) {
      emit("nice", [{ type: "report", message: "cancelled — no plan selected" }]);
      return;
    }
    pickedSlug = picked;
  }
  success(`selected: ${pickedSlug}`);

  const paths = planPaths(repo, pickedSlug);
  const tmpSpec = path.join(
    os.tmpdir(),
    `oh-nice-update-spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`,
  );

  step(2, 3, "Brainstorming with superpowers (delta-only)");
  hint(`existing spec: ${shortHome(paths.specMd)}`);

  const brainstormInstr = [
    `This is an **iteration** on an existing plan, not a green-field design.`,
    `**Read the existing spec at ${paths.specMd} first** to anchor on prior intent — don't re-litigate decisions already made there.`,
    `**Read the existing plan at ${paths.planMd}** so you know which tasks are done (\`[x]\`) and which are still open (\`[ ]\`).`,
    ``,
    `**User's update request:** ${request ? JSON.stringify(request) : "(none yet — ask the user via AskUserQuestion with a free-text input what they want to add/change/improve)"}`,
    ``,
    `Run a **tight** Socratic loop — 3-5 focused questions — scoped to **what's changing or being added**: new requirements, improvements, refactoring, applying feedback. Don't restart the design.`,
    ``,
    `Save **only the delta** (new requirements, clarifications, scope adjustments) as markdown to: ${tmpSpec}`,
    `Do NOT write a full new spec — just the new section content. It will be appended verbatim under a "## Update — YYYY-MM-DD" heading.`,
  ].join("\n");

  const actions: NextAction[] = [
    {
      type: "invoke_skill",
      skill: "superpowers:brainstorming",
      instructions: brainstormInstr,
    },
    {
      type: "report",
      message: [
        "After brainstorming returns, re-run:",
        `  bun ${CLI} nice update-plan --phase=post-brainstorm ${shellQuote(tmpSpec)} --slug ${shellQuote(pickedSlug)}`,
      ].join("\n"),
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 2: post-brainstorm — append spec delta, kick off writing-plans
// ──────────────────────────────────────────────────────────────────────────────

async function phasePostBrainstorm(rest: string[]): Promise<void> {
  let slug: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--slug") slug = rest[++i];
    else if (a.startsWith("--slug=")) slug = a.slice("--slug=".length);
    else positional.push(a);
  }
  const tmpSpec = positional[0];
  if (!tmpSpec) throw new Error("post-brainstorm needs the tmp spec path as first arg");
  if (!slug) throw new Error("post-brainstorm needs --slug <slug>");
  const pickedSlug = asSlug(slug);

  const { repo } = await detectRepo();
  const paths = planPaths(repo, pickedSlug);

  const tmpContent = (await readFile(tmpSpec, "utf-8")).trim();
  if (!tmpContent) {
    error("tmp spec is empty — aborting (brainstorming likely cancelled)");
    emit("nice", [{ type: "report", message: "update-plan aborted — empty spec delta" }]);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  await appendDatedSection(paths.specMd, today, tmpContent + "\n");
  success(`appended update to ${shortHome(paths.specMd)}`);

  const tmpPlan = path.join(
    os.tmpdir(),
    `oh-nice-update-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`,
  );

  sharedBanner({ ...PRESETS.niceUpdate, subtitle: `Repo: ${repo}  •  Writing tasks for the update` });
  step(2, 3, "Writing plan delta with superpowers");

  const writeInstr = [
    `This is an iteration on an existing plan — write **only the new tasks**, not a full rewrite.`,
    `**Reference the full spec at ${paths.specMd}** (which now includes a new "## Update — ${today}" section at the bottom — your tasks should implement that section).`,
    `**Reference the existing plan at ${paths.planMd}** so you know what's already planned and don't duplicate. Honor completed checkboxes \`[x]\` — leave them alone.`,
    ``,
    `Output: a markdown fragment containing **only the new tasks** (bite-sized TDD steps using \`- [ ]\` checkboxes) — NOT a full plan document. Save it to: ${tmpPlan}`,
    `Do not include a Goal/Architecture preamble — just the task list, as it'll be appended under "## Update — ${today}" in the existing plan.md.`,
  ].join("\n");

  const actions: NextAction[] = [
    {
      type: "invoke_skill",
      skill: "superpowers:writing-plans",
      instructions: writeInstr,
    },
    {
      type: "report",
      message: [
        "After writing-plans returns, re-run:",
        `  bun ${CLI} nice update-plan --phase=post-plan ${shellQuote(repo)} ${shellQuote(pickedSlug)} ${shellQuote(tmpPlan)} ${shellQuote(tmpSpec)}`,
      ].join("\n"),
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3: post-plan — append plan delta, clean up tmps, ask implement?
// ──────────────────────────────────────────────────────────────────────────────

async function phasePostPlan(rest: string[]): Promise<void> {
  const [repoArg, slugArg, tmpPlan, tmpSpec] = rest;
  if (!repoArg || !slugArg || !tmpPlan) {
    throw new Error("post-plan needs <repo> <slug> <tmp-plan> [<tmp-spec>]");
  }
  const slug = asSlug(slugArg);
  const paths = planPaths(repoArg, slug);

  const planDelta = (await readFile(tmpPlan, "utf-8")).trim();
  if (!planDelta) {
    error("tmp plan is empty — aborting (writing-plans likely produced nothing)");
    emit("nice", [{ type: "report", message: "update-plan aborted — empty plan delta" }]);
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  await appendDatedSection(paths.planMd, today, planDelta + "\n");
  success(`appended new tasks to ${shortHome(paths.planMd)}`);

  // cleanup tmps (best-effort)
  await trashIfExists(tmpPlan);
  if (tmpSpec) await trashIfExists(tmpSpec);

  sharedBanner({ ...PRESETS.niceUpdate, subtitle: `New tasks in: ${shortHome(paths.planMd)}` });

  const actions: NextAction[] = [
    {
      type: "ask_user",
      question: "What now?",
      options: ["Implement now (Mirai via /oh-nice go)", "Stop here"],
    },
    {
      type: "report",
      message: [
        "If the user picks 'Implement now', run:",
        `  bun ${CLI} nice go --slug ${shellQuote(slug)}`,
        "Otherwise confirm the plan path and end.",
      ].join("\n"),
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers (exported for tests)
// ──────────────────────────────────────────────────────────────────────────────

export async function appendDatedSection(
  filePath: string,
  isoDate: string,
  body: string,
): Promise<void> {
  // Build heading; if today's heading already exists, suffix (2), (3), …
  const baseHeading = `## Update — ${isoDate}`;
  let existing = "";
  try {
    existing = await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    existing = "";
  }
  const re = new RegExp(`^## Update — ${isoDate}( \\((\\d+)\\))?$`, "gm");
  let max = -1; // -1 means no match yet
  for (const m of existing.matchAll(re)) {
    const nStr = m[2];
    const n = nStr ? parseInt(nStr, 10) : 1;
    if (n > max) max = n;
  }
  const heading = max === -1 ? baseHeading : `${baseHeading} (${max + 1})`;
  const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  const sectionGap = existing.length > 0 ? "\n" : "";
  const next =
    existing + sep + sectionGap + heading + "\n\n" + body.replace(/\s+$/, "") + "\n";
  await writeFile(filePath, next, "utf-8");
}

async function trashIfExists(p: string): Promise<void> {
  try {
    await stat(p);
  } catch {
    return;
  }
  try {
    await $`trash ${p}`.quiet();
  } catch {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(p);
    } catch {
      /* best-effort */
    }
  }
}

function shortHome(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// silence unused
void rename;
