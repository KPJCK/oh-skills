// src/shared/plugin-root.ts
import path from "node:path";
import { existsSync } from "node:fs";

// The env var agy would inject for the plugin root. Confirmed in findings.md (Task spike-agy):
// agy v1.0.3 injects NO plugin-root var today; this probe is kept only as forward-compat in case
// a future agy release adds one. The known-install-path fallback below is the real agy mechanism.
export const AGY_ROOT_ENV = "ANTIGRAVITY_PLUGIN_ROOT";

// Codex injects no plugin-root env var into skill context and its plugin validator rejects hooks,
// so the ~/.oh-skills anchor (created by scripts/install-codex.sh) is the Codex mechanism.
const KNOWN_INSTALL_DIRS = [
  [".oh-skills"],
  ["plugins", "oh-skills"],
  [".gemini", "antigravity-cli", "plugins", "oh-skills"],
] as const;

/** Locate the oh-skills plugin root across hosts.
 *  Probe order:
 *   (a) env.CLAUDE_PLUGIN_ROOT
 *   (b) env[AGY_ROOT_ENV] (ANTIGRAVITY_PLUGIN_ROOT)
 *   (c) env.PLUGIN_ROOT — reserved; no known host sets this in skill context today
 *       (Codex forbids hooks, where it would otherwise appear); kept for forward-compat
 *   (d) first existing of [~/.oh-skills, ~/plugins/oh-skills, ~/.gemini/antigravity-cli/plugins/oh-skills]
 *       that contains a src/cli.ts
 *   (e) default ~/.oh-skills
 */
export function resolvePluginRoot(
  env: Record<string, string | undefined> = process.env,
  home: string = process.env.HOME ?? "",
): string {
  if (env.CLAUDE_PLUGIN_ROOT) return env.CLAUDE_PLUGIN_ROOT;
  const agy = env[AGY_ROOT_ENV];
  if (agy) return agy;
  if (env.PLUGIN_ROOT) return env.PLUGIN_ROOT;
  for (const segments of KNOWN_INSTALL_DIRS) {
    const candidate = path.join(home, ...segments);
    if (existsSync(path.join(candidate, "src", "cli.ts"))) return candidate;
  }
  return path.join(home, ".oh-skills");
}

/**
 * Canonical bash expression embedded verbatim in every skills/*\/SKILL.md shim.
 * Stateless drop-in replacement for a bare ${CLAUDE_PLUGIN_ROOT}. It mirrors resolvePluginRoot()'s
 * env-var probe order (a → b → c: CLAUDE_PLUGIN_ROOT → ANTIGRAVITY_PLUGIN_ROOT → PLUGIN_ROOT) and
 * then defaults to the ~/.oh-skills anchor. The TS resolver additionally checks alternative install
 * paths (step d) before the same default; bash relies on the anchor created by scripts/install-codex.sh.
 * Works in a single invocation on all supported hosts with no prior variable assignment.
 */
export const SHIM_ROOT_EXPR =
  "${CLAUDE_PLUGIN_ROOT:-${" + AGY_ROOT_ENV + ":-${PLUGIN_ROOT:-$HOME/.oh-skills}}}";
