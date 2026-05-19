// src/skills/nice/index.ts
import { error } from "../../shared/ui.ts";

type SubRunner = {
  run: (args: string[]) => Promise<void>;
};

const SUBS: Record<string, () => Promise<SubRunner>> = {
  "update-plan": () => import("./commands/update-plan.ts"),
  go: () => import("./commands/go.ts"),
  review: () => import("./commands/review.ts"),
  fix: () => import("./commands/fix.ts"),
};

export async function run(args: string[]): Promise<void> {
  const sub = args[0];
  if (!sub) {
    error(
      "nice requires a subcommand",
      `expected one of: ${Object.keys(SUBS).join(", ")}`,
    );
    process.exit(2);
  }

  const loader = SUBS[sub];
  if (!loader) {
    error(
      `unknown nice subcommand: ${sub}`,
      `expected one of: ${Object.keys(SUBS).join(", ")}`,
    );
    process.exit(2);
  }

  const mod = await loader();
  await mod.run(args.slice(1));
}
