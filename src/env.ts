// src/env.ts
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

export type AgentRole = "coding" | "review" | "research";

export type OhEnv = {
  CONTEXT_DIR: string;
  CONTEXT_TEMPLATE_DIR: string;
  KNOWLEDGE_DIR: string;
  PLAN_DIR: string;
  CODING_AGENT?: string;
  REVIEW_AGENT?: string;
  RESEARCH_AGENT?: string;
};

const PATH_KEYS = ["CONTEXT_DIR", "CONTEXT_TEMPLATE_DIR", "KNOWLEDGE_DIR", "PLAN_DIR"] as const;
const AGENT_KEYS = ["CODING_AGENT", "REVIEW_AGENT", "RESEARCH_AGENT"] as const;
const ALL_KEYS = [...PATH_KEYS, ...AGENT_KEYS] as const;

function defaults(cwd: string): Record<string, string> {
  return {
    CONTEXT_DIR: path.join(cwd, ".oh", "context"),
    CONTEXT_TEMPLATE_DIR: path.join(cwd, ".oh", "context-templates"),
    KNOWLEDGE_DIR: path.join(cwd, ".oh", "knowledge"),
    PLAN_DIR: path.join(cwd, ".oh", "plan"),
  };
}

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip surrounding quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function expandPath(value: string, cwd: string, home: string): string {
  if (!value) return value;
  // ~ expansion
  if (value === "~") return home;
  if (value.startsWith("~/")) return path.join(home, value.slice(2));
  // absolute
  if (path.isAbsolute(value)) return value;
  // relative → resolve from cwd
  return path.resolve(cwd, value);
}

export function loadOhEnv(opts: { cwd?: string; home?: string } = {}): OhEnv {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? process.env.HOME ?? os.homedir();

  const projectPath = path.join(cwd, ".oh-env");
  const homePath = path.join(home, ".claude", ".oh-env");
  const projectExists = existsSync(projectPath);
  const homeExists = existsSync(homePath);

  if (!projectExists && !homeExists) {
    // also OK if all required keys come from process.env
    const allFromEnv = PATH_KEYS.every((k) => process.env[k]);
    if (!allFromEnv) {
      throw new Error(
        "No .oh-env found at ./.oh-env or ~/.claude/.oh-env. Run /oh init to scaffold one.",
      );
    }
  }

  const homeVals = homeExists ? parseEnvFile(readFileSync(homePath, "utf-8")) : {};
  const projectVals = projectExists ? parseEnvFile(readFileSync(projectPath, "utf-8")) : {};
  const defaultVals = defaults(cwd);

  // per-key merge: defaults < home < project < process.env
  const merged: Record<string, string> = { ...defaultVals };
  for (const k of ALL_KEYS) {
    if (homeVals[k] !== undefined) merged[k] = homeVals[k];
    if (projectVals[k] !== undefined) merged[k] = projectVals[k];
    if (process.env[k] !== undefined) merged[k] = process.env[k] as string;
  }

  const env: OhEnv = {
    CONTEXT_DIR: expandPath(merged.CONTEXT_DIR ?? "", cwd, home),
    CONTEXT_TEMPLATE_DIR: expandPath(merged.CONTEXT_TEMPLATE_DIR ?? "", cwd, home),
    KNOWLEDGE_DIR: expandPath(merged.KNOWLEDGE_DIR ?? "", cwd, home),
    PLAN_DIR: expandPath(merged.PLAN_DIR ?? "", cwd, home),
  };

  // agent keys: only set if non-empty after trim
  for (const k of AGENT_KEYS) {
    const v = merged[k]?.trim();
    if (v) (env as Record<string, string | undefined>)[k] = v;
  }

  return env;
}

export type Host = "claude" | "agy" | "codex" | "unknown";

/** Detect the host CLI from environment markers. Claude sets CLAUDE_PLUGIN_ROOT/CLAUDECODE;
 *  agy sets ANTIGRAVITY_AGENT / ANTIGRAVITY_CONVERSATION_ID / its plugin-root var.
 *  Codex detection is best-effort (CODEX_HOME / CODEX_SANDBOX / CODEX_SANDBOX_NETWORK_DISABLED) —
 *  Codex has no guaranteed runtime marker, so dispatch correctness does not depend on this. */
export function detectHost(env: Record<string, string | undefined> = process.env): Host {
  if (env.CLAUDE_PLUGIN_ROOT || env.CLAUDECODE) return "claude";
  if (env.ANTIGRAVITY_AGENT || env.ANTIGRAVITY_CONVERSATION_ID || env.ANTIGRAVITY_PLUGIN_ROOT)
    return "agy";
  if (env.CODEX_HOME || env.CODEX_SANDBOX || env.CODEX_SANDBOX_NETWORK_DISABLED) return "codex";
  return "unknown";
}

export function resolveAgent(
  role: AgentRole,
  env: OhEnv,
  host: Host = detectHost(),
): string | null {
  // Named subagents (Mirai/Yama/Rudy) exist only on Claude Code; return null on all other hosts.
  if (host !== "claude") return null;
  const key =
    role === "coding" ? "CODING_AGENT" : role === "review" ? "REVIEW_AGENT" : "RESEARCH_AGENT";
  return env[key]?.trim() || null;
}
