import { rename, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { detectRepo } from "../repo.ts";
import { createPlanDir, planPaths } from "../plans.ts";
import { promptSlug, asSlug } from "../prompts.ts";
import { banner, step, success, info, hint, box } from "../ui.ts";
import { emit, type NextAction } from "../../../shared/next-action.ts";

const CLI = "${CLAUDE_PLUGIN_ROOT}/src/cli.ts";

type Phase = "init" | "post-brainstorm" | "post-plan";

type Args = {
  phase: Phase;
  rest: string[];
};

function parseArgs(args: string[]): Args {
  let phase: Phase = "init";
  const rest: string[] = [];
  for (const a of args) {
    if (a.startsWith("--phase=")) {
      const v = a.slice("--phase=".length);
      if (v === "init" || v === "post-brainstorm" || v === "post-plan") {
        phase = v;
      } else {
        throw new Error(`unknown phase: ${v}`);
      }
    } else {
      rest.push(a);
    }
  }
  return { phase, rest };
}

export async function run(args: string[]): Promise<void> {
  const { phase, rest } = parseArgs(args);
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
// Phase 1: init — kick off brainstorm via superpowers
// ──────────────────────────────────────────────────────────────────────────────

async function phaseInit(rest: string[]): Promise<void> {
  const request = rest.join(" ").trim() || "(no initial request given)";
  const { repo, source, cwd } = await detectRepo();

  banner(
    "plan · init",
    `Designing: ${request}\nRepo: ${repo} (${source})  •  cwd: ${shorten(cwd)}`,
  );

  step(1, 3, "Brainstorming with superpowers");
  hint("handing off to claude — the brainstorming skill will run a Socratic interview");

  const tmpSpec = path.join(
    os.tmpdir(),
    `oh-nice-spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`,
  );

  const actions: NextAction[] = [
    {
      type: "invoke_skill",
      skill: "superpowers:brainstorming",
      instructions: [
        `Run the full brainstorming flow for the user's request: ${JSON.stringify(request)}.`,
        `Save the resulting design spec to: ${tmpSpec}`,
        `Do NOT use the default save path (docs/superpowers/specs/...) — use the path above so 'oh-nice plan' can move it into the plan dir.`,
        `Run the full Socratic interview — do not truncate.`,
      ].join("\n"),
    },
    {
      type: "report",
      message: [
        "After the brainstorming skill returns:",
        "1. Ask the user for a slug (lowercase-kebab, e.g. 'add-auth-flow') via AskUserQuestion or plain conversation.",
        "2. Re-run with --slug:",
        `   bun ${CLI} nice plan --phase=post-brainstorm ${shellQuote(tmpSpec)} ${shellQuote(request)} --slug <slug>`,
      ].join("\n"),
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 2: post-brainstorm — name the plan, create dir, kick off writing-plans
// ──────────────────────────────────────────────────────────────────────────────

async function phasePostBrainstorm(rest: string[]): Promise<void> {
  // Extract --slug flag from rest, leaving positional args
  let slugFlag: string | null = null;
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--slug") slugFlag = rest[++i] ?? null;
    else if (a.startsWith("--slug=")) slugFlag = a.slice("--slug=".length);
    else positional.push(a);
  }

  const [specPathArg, ...requestParts] = positional;
  const request = requestParts.join(" ").trim() || "(no initial request)";
  if (!specPathArg) {
    throw new Error(
      "post-brainstorm needs the spec file path as the first argument",
    );
  }
  const specPath = specPathArg;

  const { repo } = await detectRepo();

  banner("plan · brainstorm done", `Repo: ${repo}  •  Request: ${request}`);
  step(2, 3, "Name this plan");

  let slug: ReturnType<typeof asSlug>;
  if (slugFlag) {
    slug = asSlug(slugFlag);
    info(`using --slug ${slug}`);
  } else {
    if (!process.stdin.isTTY) {
      const { error } = await import("../ui.ts");
      error(
        "post-brainstorm needs a slug — interactive prompt requires a TTY",
        `pass --slug <slug>. Example:\n         bun ${CLI} nice plan --phase=post-brainstorm ${specPath} ${JSON.stringify(request)} --slug add-auth-flow`,
      );
      process.exit(2);
    }
    slug = await promptSlug({
      message: "slug for this plan",
    });
  }

  const paths = await createPlanDir(repo, slug);
  await rename(specPath, paths.specMd).catch(async (err) => {
    // if rename failed (cross-device), fall back to read+write+unlink
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      const data = await readFile(specPath);
      await Bun.write(paths.specMd, data);
      await Bun.file(specPath).delete?.();
    } else {
      throw err;
    }
  });
  success(`created ${shorten(paths.dir)}`);
  info(`spec saved at ${shorten(paths.specMd)}`);

  step(3, 3, "Writing plan with superpowers");
  hint("handing off to claude — writing-plans will turn the spec into a checklist");

  const actions: NextAction[] = [
    {
      type: "invoke_skill",
      skill: "superpowers:writing-plans",
      instructions: [
        `Reference the spec at: ${paths.specMd}`,
        `Save the plan to: ${paths.planMd}`,
        `Do NOT use the default save path (docs/superpowers/plans/...) — use the path above.`,
        `Use bite-sized task granularity per superpowers convention.`,
      ].join("\n"),
    },
    {
      type: "report",
      message: [
        "After writing-plans returns, re-run:",
        `  bun ${CLI} nice plan --phase=post-plan ${shellQuote(repo)} ${shellQuote(slug)}`,
      ].join("\n"),
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3: post-plan — summarize, ask implement-now-or-stop
// ──────────────────────────────────────────────────────────────────────────────

async function phasePostPlan(rest: string[]): Promise<void> {
  const [repoArg, slugArg] = rest;
  if (!repoArg || !slugArg) {
    throw new Error("post-plan needs <repo> <slug> args");
  }
  const repo = repoArg;
  const slug = asSlug(slugArg);
  const paths = planPaths(repo, slug);

  const planContent = await readFile(paths.planMd, "utf-8");
  const summary = summarizePlan(planContent);

  banner("plan · ready", `Plan written: ${shorten(paths.planMd)}`);
  box(summary, { title: "Plan summary", color: "magenta" });

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
        `(or invoke the 'oh-nice' skill with args 'go --slug ${slug}').`,
        "If the user picks 'Stop here', just confirm the plan path and end.",
      ].join("\n"),
    },
  ];
  emit("nice", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function summarizePlan(content: string): string {
  // pull the first 5 H2/H3 headings or top-level checkbox tasks
  const lines = content.split("\n");
  const items: string[] = [];
  for (const line of lines) {
    if (items.length >= 5) break;
    const trimmed = line.trim();
    if (
      /^##+\s+/.test(trimmed) ||
      /^[-*]\s+\[ \]\s+/.test(trimmed) ||
      /^\d+\.\s+/.test(trimmed)
    ) {
      const cleaned = trimmed
        .replace(/^##+\s+/, "")
        .replace(/^[-*]\s+\[ \]\s+/, "")
        .replace(/^\d+\.\s+/, "");
      if (cleaned.length > 0 && !/^plan\b/i.test(cleaned)) {
        items.push(`• ${cleaned}`);
      }
    }
  }
  if (items.length === 0) {
    return "(plan written — open it to review)";
  }
  return items.join("\n");
}

function shorten(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

