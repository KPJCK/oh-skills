// src/skills/bug-tracing/index.ts
import { error } from "../../shared/ui";

type Cmd = { run: (args: string[]) => Promise<void> };

const subcommands: { name: string; short: string; load: () => Promise<Cmd> }[] = [
  {
    name: "fix",
    short: "Fix a bug + write forensic trace.md",
    load: () => import("./commands/fix"),
  },
];

export async function run(args: string[]): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub) {
    const { emit } = await import("../../shared/next-action");
    emit("bug-tracing", [
      {
        type: "ask_user",
        question: "Which oh-bug-tracing subcommand?",
        options: subcommands.map((s) => `${s.name} — ${s.short}`),
      },
      {
        type: "report",
        message:
          'Once the user picks, re-run: bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts bug-tracing fix "<bug description>"',
      },
    ]);
    return;
  }

  const found = subcommands.find((s) => s.name === sub);
  if (!found) {
    error(
      `unknown bug-tracing subcommand: ${sub}`,
      `expected one of: ${subcommands.map((s) => s.name).join(", ")}`,
    );
    process.exit(2);
  }
  const mod = await found.load();
  await mod.run(rest);
}
