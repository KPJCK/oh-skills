import { readFile } from "node:fs/promises";
import { detectRepo } from "../repo.ts";
import { planPaths, listPlans } from "../plans.ts";
import { pickPlan } from "../picker.ts";
import { buildPlanPickerAskPayload } from "../ask-ui.ts";
import { banner, step, success, info, hint, error } from "../ui.ts";
import { emit, type NextAction, buildAgentAction } from "../../../shared/next-action.ts";
import { loadOhEnv } from "../../../env.ts";
import { fixPrompts } from "../prompts.ts";

type Flags = { plan: string | null; emitAskJson: boolean };

function parseFlags(args: string[]): Flags {
  const flags: Flags = { plan: null, emitAskJson: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--plan") flags.plan = args[++i] ?? null;
    else if (a === "--emit-ask-json") flags.emitAskJson = true;
    else throw new Error(`unknown flag: ${a}`);
  }
  return flags;
}

export async function run(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const { repo } = await detectRepo();

  if (flags.emitAskJson) {
    const plans = await listPlans(repo);
    const reviewable = plans.filter((p) => p.hasReview);
    const payload = buildPlanPickerAskPayload(reviewable, "fix");
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  banner("fix", `Repo: ${repo}  •  Mirai will apply the latest review round`);

  step(1, 2, "Pick a plan with a review to apply");
  let slug: string;
  if (flags.plan) {
    slug = flags.plan;
    info(`using --plan ${slug}`);
  } else {
    const plans = await listPlans(repo);
    const reviewable = plans.filter((p) => p.hasReview);
    if (reviewable.length === 0) {
      error(
        "no plans with review.md found for this repo",
        "run /oh-nice review first",
      );
      emit("nice", [
        { type: "report", message: "no reviewable plans — exiting" },
      ]);
      return;
    }
    if (!process.stdin.isTTY) {
      error(
        "interactive plan picker requires a TTY",
        `pass --plan <slug>. Available reviewable plans for ${repo}:\n         - ${reviewable.map((p) => p.name).join("\n         - ")}`,
      );
      process.exit(2);
    }
    const picked = await pickPlan(repo, { filter: (p) => p.hasReview });
    if (!picked) {
      error("cancelled");
      emit("nice", [{ type: "report", message: "cancelled — no plan selected" }]);
      return;
    }
    slug = picked;
  }
  success(`selected: ${slug}`);

  const paths = planPaths(repo, slug);
  const reviewContent = await readFile(paths.reviewMd, "utf-8");
  const latest = extractLatestRound(reviewContent);

  step(2, 2, "Dispatching implementer to apply review feedback");
  hint(`latest round: ${latest.heading || "(no round heading found)"}`);

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
      env: loadOhEnv(),
      dispatchedPrompt: fixPrompts.dispatched(ctx),
      selfActPrompt: fixPrompts.selfAct(ctx),
    }),
    {
      type: "report",
      message: `After the implementer returns, suggest running '/oh-nice review' for round ${latest.round + 1}.`,
    },
  ];
  emit("nice", actions);
}

function extractLatestRound(content: string): {
  round: number;
  heading: string;
  body: string;
} {
  const matches = [...content.matchAll(/^## Round (\d+)\b.*$/gm)];
  if (matches.length === 0) {
    return { round: 0, heading: "", body: content };
  }
  let maxIdx = 0;
  let maxRound = 0;
  matches.forEach((m, i) => {
    const n = Number.parseInt(m[1] ?? "0", 10);
    if (n >= maxRound) {
      maxRound = n;
      maxIdx = i;
    }
  });
  const target = matches[maxIdx]!;
  const next = matches[maxIdx + 1];
  const start = target.index ?? 0;
  const end = next?.index ?? content.length;
  return {
    round: maxRound,
    heading: target[0],
    body: content.slice(start, end),
  };
}
