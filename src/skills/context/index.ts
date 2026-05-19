// src/skills/context/index.ts
import { error } from "../../shared/ui.ts";
import { banner } from "../../shared/banner.ts";
import { PRESETS } from "../../shared/banner-presets.ts";

type SubRunner = {
  run: (args: string[]) => Promise<void>;
};

const SUBS: Record<string, () => Promise<SubRunner>> = {
  load: () => import("./commands/load.ts"),
  list: () => import("./commands/list.ts"),
  check: () => import("./commands/check.ts"),
  add: () => import("./commands/add.ts"),
  update: () => import("./commands/update.ts"),
  promote: () => import("./commands/promote.ts"),
  template: () => import("./commands/template.ts"),
  clear: () => import("./commands/clear.ts"),
  huh: () => import("./commands/huh.ts"),
};

export async function run(args: string[]): Promise<void> {
  const first = args[0];

  // Default to `load` when no subcommand or it looks like a flag (e.g. --pick, --all, --template)
  const sub =
    !first || first.startsWith("-") ? "load" : first;

  // `huh` is machine-readable (outputs only `true`/`false`) — suppress banner
  if (sub !== "huh") {
    banner(PRESETS.context);
  }
  const rest = !first || first.startsWith("-") ? args : args.slice(1);

  const loader = SUBS[sub];
  if (!loader) {
    error(
      `unknown context subcommand: ${sub}`,
      `expected one of: ${Object.keys(SUBS).join(", ")}`,
    );
    process.exit(2);
  }

  const mod = await loader();
  await mod.run(rest);
}
