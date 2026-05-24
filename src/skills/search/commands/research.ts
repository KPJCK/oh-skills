// src/skills/search/commands/research.ts
import { info, error } from "../../../shared/ui.ts";
import { buildAgentAction, emit } from "../../../shared/next-action.ts";
import { loadOhEnv } from "../../../env.ts";

export async function run(args: string[]): Promise<void> {
  const query = args.join(" ").trim();
  if (!query) {
    error("missing query", "example: /oh-search research bun sqlite api");
    process.exit(2);
  }

  info(`emitting research directive for: ${query}`);

  const env = loadOhEnv();

  const dispatchedPrompt = [
    `You are a research sub-agent dispatched to gather information on:`,
    ``,
    `> ${query}`,
    ``,
    `Use WebSearch and WebFetch (3-5 sources). Synthesize a coherent markdown body`,
    `with sections: Overview / Key concepts / Examples / Gotchas.`,
    `Return ONLY the markdown body — the parent will handle save confirmation.`,
  ].join("\n");

  const selfActPrompt = [
    `Research the following query and synthesize a coherent markdown body:`,
    ``,
    `> ${query}`,
    ``,
    `1. Use WebSearch on the query.`,
    `2. WebFetch 3-5 high-quality sources.`,
    `3. Write a markdown body with sections: Overview / Key concepts / Examples / Gotchas.`,
    `4. Show the body to the user with the saved-knowledge preview (path, title, summary, first ~20 lines).`,
    `5. Ask via AskUserQuestion: "Save this as knowledge?" with options "YES, save it" / "No, discard" / "Edit first".`,
    `6. ONLY if the user picks "YES, save it", call: bun \${CLAUDE_PLUGIN_ROOT}/src/cli.ts search add <name> ... --confirmed`,
  ].join("\n");

  emit("search", [
    buildAgentAction({
      role: "research",
      env,
      dispatchedPrompt,
      selfActPrompt,
    }),
  ]);
}
