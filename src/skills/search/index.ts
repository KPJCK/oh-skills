// src/skills/search/index.ts
import { error } from "../../shared/ui";
import { banner } from "../../shared/banner";
import { GRADIENTS } from "../../shared/banner-presets";

type Cmd = { run: (args: string[]) => Promise<void> };

const commands: Record<string, () => Promise<Cmd>> = {
  find: () => import("./commands/find"),
  research: () => import("./commands/research"),
  add: () => import("./commands/add"),
  update: () => import("./commands/update"),
  delete: () => import("./commands/delete"),
  list: () => import("./commands/list"),
};

export async function run(args: string[]): Promise<void> {
  // suppress banner for machine-readable subs (none currently, but guard here if added)
  banner({
    title: "[OH! >> SEARCH SEARCH]",
    gradient: GRADIENTS.search,
  });
  const sub = args[0];
  const rest = args.slice(1);
  if (!sub) {
    error("missing search subcommand", `expected one of: ${Object.keys(commands).join(", ")}`);
    process.exit(2);
  }
  const loader = commands[sub];
  if (!loader) {
    error(
      `unknown search subcommand: ${sub}`,
      `expected one of: ${Object.keys(commands).join(", ")}`,
    );
    process.exit(2);
  }
  const mod = await loader();
  await mod.run(rest);
}
