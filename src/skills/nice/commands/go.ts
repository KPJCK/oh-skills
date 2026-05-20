import { readFile } from "node:fs/promises";
import { detectRepo } from "../repo.ts";
import { planPaths, listPlans } from "../plans.ts";
import { pickPlan } from "../picker.ts";
import { asSlug } from "../prompts.ts";
import { buildPlanPickerAskPayload } from "../ask-ui.ts";
import { step, success, info, hint, error, c } from "../ui.ts";
import { banner as sharedBanner } from "../../../shared/banner.ts";
import { GRADIENTS } from "../../../shared/banner-presets.ts";
import { emit, type NextAction, buildAgentAction } from "../../../shared/next-action.ts";
import { loadOhEnv } from "../../../env.ts";
import { goPrompts } from "../prompts.ts";

type Args = {
  slug: string | undefined;
  emitAskJson: boolean;
};

function parseArgs(args: string[]): Args {
  let slug: string | undefined;
  let emitAskJson = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--slug") {
      slug = args[++i];
    } else if (a.startsWith("--slug=")) {
      slug = a.slice("--slug=".length);
    } else if (a === "--plan") {
      slug = args[++i];
    } else if (a === "--emit-ask-json") {
      emitAskJson = true;
    }
  }
  return { slug, emitAskJson };
}

export async function run(args: string[]): Promise<void> {
  const { slug: slugArg, emitAskJson } = parseArgs(args);
  const { repo } = await detectRepo();

  if (emitAskJson) {
    const plans = await listPlans(repo);
    const executable = plans.filter((p) => p.hasPlan);
    const payload = buildPlanPickerAskPayload(executable, "go");
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  const env = loadOhEnv();
  const agentName = env.CODING_AGENT?.trim() || "main Claude";
  const agentTag = `[${agentName}]`;
  sharedBanner({
    title: "[OH! >> NICE >> GO]",
    subtitle: `${repo} · ${agentTag} → execute`,
    subtitleHighlights: [agentTag],
    gradient: GRADIENTS.nice,
  });

  step(1, 2, "pick plan");
  let slug: string;
  if (slugArg) {
    slug = asSlug(slugArg);
    info(`using --slug ${slug}`);
  } else {
    const plans = await listPlans(repo);
    const executable = plans.filter((p) => p.hasPlan);
    if (executable.length === 0) {
      error(
        "no plans with plan.md found for this repo",
        "run /oh-nice plan first to create one",
      );
      emit("nice", [{ type: "report", message: "no executable plans — exiting" }]);
      return;
    }
    if (!process.stdin.isTTY) {
      error(
        "interactive plan picker requires a TTY",
        `pass --slug <slug> (or --plan <slug>). Available executable plans for ${repo}:\n         - ${executable.map((p) => p.name).join("\n         - ")}`,
      );
      process.exit(2);
    }
    const picked = await pickPlan(repo, { filter: (p) => p.hasPlan });
    if (!picked) {
      error("cancelled");
      emit("nice", [{ type: "report", message: "cancelled — no plan selected" }]);
      return;
    }
    slug = picked;
  }
  success(`selected: ${slug}`);

  const paths = planPaths(repo, slug);
  const planContent = await readFile(paths.planMd, "utf-8");
  const taskCount = countTasks(planContent);
  const goal = extractGoal(planContent);

  if (goal) info(`goal: ${goal}`);
  hint(`tasks: ${taskCount}`);

  step(2, 2, "dispatch implementer");
  const ctx = {
    planPath: paths.planMd,
    specPath: paths.specMd,
    reviewPath: paths.reviewMd,
    repo,
    slug,
  };

  const actions: NextAction[] = [
    buildAgentAction({
      role: "coding",
      env,
      dispatchedPrompt: goPrompts.dispatched(ctx),
      selfActPrompt: goPrompts.selfAct(ctx),
    }),
    {
      type: "report",
      message: `next: /oh-nice review`,
    },
  ];
  emit("nice", actions);
}

function countTasks(content: string): number {
  const matches = content.match(/^\s*[-*]\s+\[ \]\s+/gm);
  return matches?.length ?? 0;
}

function extractGoal(content: string): string | null {
  // look for `**Goal:** ...` (superpowers writing-plans header convention)
  const match = content.match(/^\*\*Goal:\*\*\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

// silence unused
void c;
