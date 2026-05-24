// src/skills/nice/index.ts
import { error } from "../../shared/ui";

type Cmd = { run: (args: string[]) => Promise<void> };

const subcommands: { name: string; short: string; load: () => Promise<Cmd> }[] = [
  { name: "plan", short: "Brainstorm + write a plan", load: () => import("./commands/plan") },
  {
    name: "update-plan",
    short: "Append updates to an existing plan",
    load: () => import("./commands/update-plan"),
  },
  { name: "go", short: "Implement the plan", load: () => import("./commands/go") },
  { name: "review", short: "Review against the plan", load: () => import("./commands/review") },
  { name: "fix", short: "Apply latest review feedback", load: () => import("./commands/fix") },
  {
    name: "do",
    short: "JFDI: implement → review → fix without artifacts",
    load: () => import("./commands/do"),
  },
];

export async function run(args: string[]): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);

  if (!sub) {
    // emit picker (matches existing showPicker behavior)
    const { emit } = await import("../../shared/next-action");
    emit("nice", [
      {
        type: "ask_user",
        question: "Which oh-nice subcommand?",
        options: subcommands.map((s) => `${s.name} — ${s.short}`),
      },
      {
        type: "report",
        message:
          "Once the user picks an option, extract the leading word and run: bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts nice <subcommand>",
      },
    ]);
    return;
  }

  const found = subcommands.find((s) => s.name === sub);
  if (!found) {
    error(
      `unknown nice subcommand: ${sub}`,
      `expected one of: ${subcommands.map((s) => s.name).join(", ")}`,
    );
    process.exit(2);
  }
  const mod = await found.load();
  await mod.run(rest);
}
