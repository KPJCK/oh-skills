// src/shared/plugin-root.ts
import path from "node:path";

// The env var agy would inject for the plugin root. Confirmed in findings.md (Task spike-agy):
// agy v1.0.3 injects NO plugin-root var today; this probe is kept only as forward-compat in case
// a future agy release adds one. The known-install-path fallback below is the real agy mechanism.
export const AGY_ROOT_ENV = "ANTIGRAVITY_PLUGIN_ROOT";

const KNOWN_AGY_INSTALL = [".gemini", "antigravity-cli", "plugins", "oh-skills"] as const;

/** Locate the oh-skills plugin root across hosts. Probe order: Claude → agy env → known agy path. */
export function resolvePluginRoot(
  env: Record<string, string | undefined> = process.env,
  home: string = process.env.HOME ?? "",
): string {
  if (env.CLAUDE_PLUGIN_ROOT) return env.CLAUDE_PLUGIN_ROOT;
  const agy = env[AGY_ROOT_ENV];
  if (agy) return agy;
  return path.join(home, ...KNOWN_AGY_INSTALL);
}

/**
 * Canonical bash expression embedded verbatim in every skills/*\/SKILL.md shim.
 * Stateless drop-in replacement for a bare ${CLAUDE_PLUGIN_ROOT}; mirrors resolvePluginRoot()'s
 * probe order so a single invocation works on both hosts with no prior variable assignment.
 */
export const SHIM_ROOT_EXPR =
  "${CLAUDE_PLUGIN_ROOT:-${" + AGY_ROOT_ENV + ":-$HOME/.gemini/antigravity-cli/plugins/oh-skills}}";
