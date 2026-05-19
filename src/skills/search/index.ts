// src/skills/search/index.ts
import { error } from "../../shared/ui.ts";

type Cmd = { run: (args: string[]) => Promise<void> };

const commands: Record<string, () => Promise<Cmd>> = {
  find: () => import("./commands/find.ts"),
  research: () => import("./commands/research.ts"),
  add: () => import("./commands/add.ts"),
  update: () => import("./commands/update.ts"),
  delete: () => import("./commands/delete.ts"),
  list: () => import("./commands/list.ts"),
};

export async function run(args: string[]): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);
  if (!sub) {
    error("missing search subcommand", `expected one of: ${Object.keys(commands).join(", ")}`);
    process.exit(2);
  }
  const loader = commands[sub];
  if (!loader) {
    error(`unknown search subcommand: ${sub}`, `expected one of: ${Object.keys(commands).join(", ")}`);
    process.exit(2);
  }
  const mod = await loader();
  await mod.run(rest);
}
