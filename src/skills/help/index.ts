// src/skills/help/index.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadOhEnv, type OhEnv } from "../../env";
import { banner } from "../../shared/banner";
import { GRADIENTS } from "../../shared/banner-presets";

function pluginRoot(): string {
  return process.env.CLAUDE_PLUGIN_ROOT ?? path.resolve(import.meta.dir, "../../..");
}

function agentLabel(name?: string): string {
  return name && name.trim() ? name.trim() : "(main conversation)";
}

function render(template: string, env: OhEnv): string {
  return template
    .replaceAll("{{CONTEXT_DIR}}", env.CONTEXT_DIR)
    .replaceAll("{{CONTEXT_TEMPLATE_DIR}}", env.CONTEXT_TEMPLATE_DIR)
    .replaceAll("{{KNOWLEDGE_DIR}}", env.KNOWLEDGE_DIR)
    .replaceAll("{{PLAN_DIR}}", env.PLAN_DIR)
    .replaceAll("{{CODING_AGENT}}", agentLabel(env.CODING_AGENT))
    .replaceAll("{{REVIEW_AGENT}}", agentLabel(env.REVIEW_AGENT))
    .replaceAll("{{RESEARCH_AGENT}}", agentLabel(env.RESEARCH_AGENT))
    .replaceAll("{{CODING_AGENT_OR_SELF}}", agentLabel(env.CODING_AGENT))
    .replaceAll("{{REVIEW_AGENT_OR_SELF}}", agentLabel(env.REVIEW_AGENT))
    .replaceAll("{{RESEARCH_AGENT_OR_SELF}}", agentLabel(env.RESEARCH_AGENT));
}

export async function run(args: string[]): Promise<void> {
  banner({
    title: "[OH! >> HELP?]",
    gradient: GRADIENTS.help,
  });
  const template = readFileSync(path.join(pluginRoot(), "templates", "HELP.md"), "utf-8");
  let env: OhEnv;
  try {
    env = loadOhEnv();
  } catch {
    // help should work even without .oh-env — show defaults
    env = {
      CONTEXT_DIR: "(not set — run /oh init)",
      CONTEXT_TEMPLATE_DIR: "(not set)",
      KNOWLEDGE_DIR: "(not set)",
      PLAN_DIR: "(not set)",
    };
  }
  let rendered = render(template, env);

  // optional section filter: bun cli.ts help oh-context → only that section
  // Matches any ## heading that contains the section text (case-insensitive).
  // Uses line-by-line scan to skip ## headings that appear inside code fences.
  const section = args[0];
  if (section) {
    const lines = rendered.split("\n");
    const sectionLower = section.toLowerCase();
    let inFence = false;
    let sectionStart = -1;
    let sectionEnd = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.startsWith("```")) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      if (line.startsWith("## ")) {
        if (sectionStart >= 0) {
          // found the next top-level ## heading after our section
          sectionEnd = i;
          break;
        }
        if (line.toLowerCase().includes(sectionLower)) {
          sectionStart = i;
        }
      }
    }

    if (sectionStart >= 0) {
      const slice =
        sectionEnd >= 0 ? lines.slice(sectionStart, sectionEnd) : lines.slice(sectionStart);
      rendered = slice.join("\n");
    }
  }
  process.stdout.write(rendered);
}
