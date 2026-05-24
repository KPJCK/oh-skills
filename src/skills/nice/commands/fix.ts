import { readFile } from "node:fs/promises";
import { detectRepo } from "../repo";
import { planPaths, listPlans } from "../plans";
import { pickPlan } from "../picker";
import { buildPlanPickerAskPayload } from "../ask-ui";
import { step, success, info, hint, error } from "../ui";
import { banner as sharedBanner } from "../../../shared/banner";
import { GRADIENTS } from "../../../shared/banner-presets";
import { emit, type NextAction, buildAgentAction } from "../../../shared/next-action";
import { loadOhEnv } from "../../../env";
import { fixPrompts } from "../prompts";

type Flags = { plan: string | null; emitAskJson: boolean };

function parseFlags(args: string[]): Flags {
  const flags: Flags = { plan: null, emitAskJson: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
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

  const env = loadOhEnv();
  const agentName = env.CODING_AGENT?.trim() || "main Claude";
  const agentTag = `[${agentName}]`;
  sharedBanner({
    title: "[OH! >> NICE >> FIX]",
    subtitle: `${repo} · ${agentTag} → apply review`,
    subtitleHighlights: [agentTag],
    gradient: GRADIENTS.nice,
  });

  step(1, 2, "pick plan with review");
  let slug: string;
  if (flags.plan) {
    slug = flags.plan;
    info(`using --plan ${slug}`);
  } else {
    const plans = await listPlans(repo);
    const reviewable = plans.filter((p) => p.hasReview);
    if (reviewable.length === 0) {
      error("no plans with review.md found for this repo", "run /oh-nice review first");
      emit("nice", [{ type: "report", message: "no reviewable plans — exiting" }]);
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

  step(2, 2, "dispatch implementer");
  hint(`latest round: ${latest.heading.length > 0 ? latest.heading : "(none)"}`);

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
      dispatchedPrompt: fixPrompts.dispatched(ctx),
      selfActPrompt: fixPrompts.selfAct(ctx),
    }),
    {
      type: "report",
      message: `next: /oh-nice review · round ${latest.round + 1}`,
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
  const target = matches[maxIdx];
  if (!target) return { round: 0, heading: "", body: content };
  const next = matches[maxIdx + 1];
  const start = target.index ?? 0;
  const end = next?.index ?? content.length;
  return {
    round: maxRound,
    heading: target[0],
    body: content.slice(start, end),
  };
}
