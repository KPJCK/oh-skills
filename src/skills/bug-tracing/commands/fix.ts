// src/skills/bug-tracing/commands/fix.ts
//
// Phase orchestrator for `oh-bug-tracing fix "<bug description>"`.
//
// --phase=fix   (default) → dispatch Mirai + report with phase=trace re-run command
// --phase=trace           → self_act detective prompt + terse report

import os from "node:os";
import { banner as sharedBanner } from "../../../shared/banner.ts";
import { emit, buildAgentAction, type NextAction } from "../../../shared/next-action.ts";
import { step, hint } from "../../../shared/ui.ts";
import { loadOhEnv } from "../../../env.ts";
import { detectRepo } from "../../nice/repo.ts";
import { slugFromDescription, resolveTracePaths, tracePaths } from "../paths.ts";
import { fixPrompts, tracePrompts } from "../prompts.ts";

const CLI = "${CLAUDE_PLUGIN_ROOT}/src/cli.ts";

// Gradient for bug-tracing banner: amber → orange
const BUG_GRADIENT: readonly [string, string] = ["#ffb347", "#ff5f00"];

type Phase = "fix" | "trace";

type ParsedArgs = {
  phase: Phase;
  bug: string;
  slug: string;
};

function parseArgs(args: string[]): ParsedArgs {
  let phase: Phase = "fix";
  let slugOverride: string | null = null;
  const positional: string[] = [];

  for (const a of args) {
    if (a === "--phase=fix") {
      phase = "fix";
    } else if (a === "--phase=trace") {
      phase = "trace";
    } else if (a.startsWith("--phase=")) {
      throw new Error(`unknown phase: ${a.slice("--phase=".length)} — expected fix or trace`);
    } else if (a.startsWith("--slug=")) {
      slugOverride = a.slice("--slug=".length).trim();
    } else {
      positional.push(a);
    }
  }

  const bug = positional.join(" ").trim();
  if (!bug) {
    throw new Error('bug description is required — usage: bug-tracing fix "<bug description>"');
  }

  const slug = slugOverride ?? slugFromDescription(bug);
  if (slug.length < 2) {
    throw new Error("could not derive a slug from the bug description — use --slug=<name>");
  }

  return { phase, bug, slug };
}

export async function run(args: string[]): Promise<void> {
  const { phase, bug, slug } = parseArgs(args);

  switch (phase) {
    case "fix":
      return phaseFix({ bug, slug });
    case "trace":
      return phaseTrace({ bug, slug });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 1: fix — dispatch Mirai, then report re-run for phase=trace
// ──────────────────────────────────────────────────────────────────────────────

async function phaseFix(ctx: { bug: string; slug: string }): Promise<void> {
  const { bug, slug } = ctx;
  const { repo, cwd: repoRoot } = await detectRepo();
  const env = loadOhEnv();
  const paths = tracePaths(env.PLAN_DIR, repo, slug);

  sharedBanner({
    title: "[OH! >> BUG-TRACING >> FIX]",
    subtitle: `${repo} · ${slug}`,
    gradient: BUG_GRADIENT,
  });

  step("dispatch fix agent");
  hint(`Mirai will fix the bug; trace phase writes ${shorten(paths.traceMd)}`);

  const dispatchedPrompt = fixPrompts.dispatched({ bug, repoRoot, slug });

  const agentAction = buildAgentAction({
    role: "coding",
    env,
    dispatchedPrompt,
    // self_act fallback: same prompt — main thread does the fix inline
    selfActPrompt: dispatchedPrompt,
  });

  const reRunCmd = [
    `bun ${CLI} bug-tracing fix`,
    `--phase=trace`,
    `--slug=${slug}`,
    shellQuote(bug),
  ].join(" ");

  const actions: NextAction[] = [
    agentAction,
    {
      type: "report",
      message: [`fix dispatched · run trace phase when done:`, `  ${reRunCmd}`].join("\n"),
    },
  ];

  emit("bug-tracing", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 2: trace — self_act detective prompt + terse summary report
// ──────────────────────────────────────────────────────────────────────────────

async function phaseTrace(ctx: { bug: string; slug: string }): Promise<void> {
  const { bug, slug } = ctx;
  const { repo, cwd: repoRoot } = await detectRepo();

  sharedBanner({
    title: "[OH! >> BUG-TRACING >> TRACE]",
    subtitle: `${repo} · ${slug}`,
    gradient: BUG_GRADIENT,
  });

  step("forensic investigation");
  hint("main thread investigates → writes trace.md");

  const paths = await resolveTracePaths(slug);

  const prompt = tracePrompts.selfAct({
    bug,
    slug,
    tracePath: paths.traceMd,
    repoRoot,
  });

  const actions: NextAction[] = [
    {
      type: "self_act",
      role: "coding",
      prompt,
    },
    {
      type: "report",
      message: `trace complete · artifact at ${shorten(paths.traceMd)}`,
    },
  ];

  emit("bug-tracing", actions);
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function shorten(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
