import { $ } from "bun";
import os from "node:os";
import { detectRepo } from "../repo.ts";
import { planPaths, nextReviewRound, listPlans } from "../plans.ts";
import { pickPlan } from "../picker.ts";
import { select, input } from "../prompts.ts";
import { buildPlanPickerAskPayload, buildScopePickerAskPayload } from "../ask-ui.ts";
import { step, success, info, hint, error, c } from "../ui.ts";
import { banner as sharedBanner } from "../../../shared/banner.ts";
import { GRADIENTS } from "../../../shared/banner-presets.ts";
import { emit, type NextAction, buildAgentAction } from "../../../shared/next-action.ts";
import { loadOhEnv } from "../../../env.ts";
import { reviewPrompts } from "../prompts.ts";

type ScopeKind = "branch" | "uncommitted" | "last-n";

type Scope =
  | { kind: "uncommitted"; baseSha: string; headSha: string; describe: string }
  | { kind: "last-n"; baseSha: string; headSha: string; n: number; describe: string }
  | { kind: "branch"; baseSha: string; headSha: string; describe: string };

type Flags = {
  plan: string | null;
  scope: ScopeKind | null;
  n: number | null;
  emitAskJson: boolean;
};

function parseFlags(args: string[]): Flags {
  const flags: Flags = { plan: null, scope: null, n: null, emitAskJson: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    switch (a) {
      case "--plan":
        flags.plan = args[++i] ?? null;
        break;
      case "--scope": {
        const v = args[++i];
        if (v !== "branch" && v !== "uncommitted" && v !== "last-n") {
          throw new Error(`--scope must be branch|uncommitted|last-n (got ${JSON.stringify(v)})`);
        }
        flags.scope = v;
        break;
      }
      case "--n": {
        const v = args[++i];
        const n = Number.parseInt(v ?? "", 10);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error(`--n must be a positive integer (got ${JSON.stringify(v)})`);
        }
        flags.n = n;
        break;
      }
      case "--emit-ask-json":
        flags.emitAskJson = true;
        break;
      default:
        throw new Error(`unknown flag: ${a}`);
    }
  }
  return flags;
}

export async function run(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const { repo } = await detectRepo();

  if (flags.emitAskJson) {
    // Emit BOTH plan picker (with whatever filter applies) and scope picker
    // so Claude can drive the full review setup with one AskUserQuestion + plan list.
    const plans = await listPlans(repo);
    const planPayload = buildPlanPickerAskPayload(plans, "review");
    const scopePayload = buildScopePickerAskPayload();
    process.stdout.write(
      JSON.stringify({ plan: planPayload, scope: scopePayload }, null, 2) + "\n",
    );
    return;
  }

  const env = loadOhEnv();
  // intentional ||: blank/whitespace .oh-env value → fall back to main agent
  const agentName = env.REVIEW_AGENT?.trim() || "main Claude";
  const agentTag = `[${agentName}]`;
  sharedBanner({
    title: "[OH! >> NICE >> REVIEW]",
    subtitle: `${repo} · ${agentTag} → append review`,
    subtitleHighlights: [agentTag],
    gradient: GRADIENTS.nice,
  });

  // ── 1. Plan selection ──
  step(1, 3, "pick plan");
  let slug: string;
  if (flags.plan) {
    slug = flags.plan;
    info(`using --plan ${slug}`);
  } else {
    const plans = await listPlans(repo);
    if (plans.length === 0) {
      error("no plans found for this repo", "run /oh-nice plan first to create one");
      emit("nice", [{ type: "report", message: "no plans found — exiting" }]);
      return;
    }
    if (!process.stdin.isTTY) {
      error(
        "interactive plan picker requires a TTY",
        `pass --plan <slug>. Available plans for ${repo}:\n         - ${plans.map((p) => p.name).join("\n         - ")}`,
      );
      process.exit(2);
    }
    const picked = await pickPlan(repo);
    if (!picked) {
      error("cancelled");
      emit("nice", [{ type: "report", message: "cancelled — no plan selected" }]);
      return;
    }
    slug = picked;
  }
  success(`selected: ${slug}`);

  // ── 2. Scope ──
  step(2, 3, "choose scope");
  const scope = await chooseScope(flags);
  info(`scope: ${scope.describe}`);
  info(`refs: ${shortSha(scope.baseSha)}..${shortSha(scope.headSha)}`);

  // ── 3. Dispatch ──
  step(3, 3, "dispatch reviewer");
  const round = await nextReviewRound(repo, slug);
  const paths = planPaths(repo, slug);
  hint(`round ${round} → ${shortPath(paths.reviewMd)}`);

  const n = scope.kind === "last-n" ? scope.n : undefined;
  const ctx = {
    planPath: paths.planMd,
    specPath: paths.specMd,
    reviewPath: paths.reviewMd,
    repo,
    slug,
    scope: scope.kind,
    n,
  };

  const actions: NextAction[] = [
    buildAgentAction({
      role: "review",
      env,
      dispatchedPrompt: reviewPrompts.dispatched(ctx),
      selfActPrompt: reviewPrompts.selfAct(ctx),
    }),
    {
      type: "report",
      message: `verdict → ${shortPath(paths.reviewMd)} · round ${round}`,
    },
  ];
  emit("nice", actions);
}

async function chooseScope(flags: Flags): Promise<Scope> {
  let kind: ScopeKind;
  if (flags.scope) {
    kind = flags.scope;
    info(`using --scope ${kind}`);
  } else {
    if (!process.stdin.isTTY) {
      error(
        "interactive scope picker requires a TTY",
        "pass --scope branch|uncommitted|last-n (and --n <N> for last-n)",
      );
      process.exit(2);
    }
    kind = (await select({
      message: "Review scope",
      default: "branch",
      choices: [
        { name: "Whole branch vs origin/main (default)", value: "branch" },
        { name: "Uncommitted (working tree + staged)", value: "uncommitted" },
        { name: "Last N commits", value: "last-n" },
      ],
    })) as ScopeKind;
  }

  if (kind === "branch") {
    const baseSha = await sh(`git merge-base HEAD origin/main`);
    const headSha = await sh(`git rev-parse HEAD`);
    return {
      kind,
      baseSha,
      headSha,
      describe: "whole branch vs origin/main",
    };
  }
  if (kind === "uncommitted") {
    const headSha = await sh(`git rev-parse HEAD`);
    return {
      kind,
      baseSha: headSha,
      headSha,
      describe: "uncommitted (working tree + staged)",
    };
  }

  // last-n
  let n: number;
  if (flags.n) {
    n = flags.n;
    info(`using --n ${n}`);
  } else {
    if (!process.stdin.isTTY) {
      error("--scope last-n requires --n <count> in non-TTY mode", "example: --scope last-n --n 3");
      process.exit(2);
    }
    const nStr = await input({
      message: "How many commits back?",
      default: "1",
      validate: (v) => /^[1-9]\d*$/.test(v.trim()) || "enter a positive integer",
    });
    n = Number.parseInt(nStr.trim(), 10);
  }
  const baseSha = await sh(`git rev-parse HEAD~${n}`);
  const headSha = await sh(`git rev-parse HEAD`);
  return {
    kind: "last-n",
    n,
    baseSha,
    headSha,
    describe: `last ${n} commit${n === 1 ? "" : "s"}`,
  };
}

async function sh(cmd: string): Promise<string> {
  const result = await $`sh -c ${cmd}`.quiet().text();
  return result.trim();
}

function shortSha(s: string): string {
  return s.length > 8 ? s.slice(0, 8) : s;
}

function shortPath(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

// silence unused
void c;
