// src/skills/context/index.ts
import { error } from "../../shared/ui";
import { banner } from "../../shared/banner";
import { GRADIENTS } from "../../shared/banner-presets";

type SubRunner = {
  run: (args: string[]) => Promise<void>;
};

const SUBS: Record<string, () => Promise<SubRunner>> = {
  load: () => import("./commands/load"),
  list: () => import("./commands/list"),
  check: () => import("./commands/check"),
  add: () => import("./commands/add"),
  update: () => import("./commands/update"),
  promote: () => import("./commands/promote"),
  template: () => import("./commands/template"),
  clear: () => import("./commands/clear"),
  huh: () => import("./commands/huh"),
};

export async function run(args: string[]): Promise<void> {
  const first = args[0];

  // Default to `load` when no subcommand or it looks like a flag (e.g. --pick, --all, --template)
  const sub = !first || first.startsWith("-") ? "load" : first;

  // `huh` is machine-readable (outputs only `true`/`false`) — suppress banner
  if (sub !== "huh") {
    banner({
      title: "[OH! >> CONTEXT]",
      gradient: GRADIENTS.context,
    });
  }
  const rest = !first || first.startsWith("-") ? args : args.slice(1);

  const loader = SUBS[sub];
  if (!loader) {
    error(`unknown context subcommand: ${sub}`, `expected one of: ${Object.keys(SUBS).join(", ")}`);
    process.exit(2);
  }

  const mod = await loader();
  await mod.run(rest);
}
