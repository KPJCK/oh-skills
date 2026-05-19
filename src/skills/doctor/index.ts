// src/skills/doctor/index.ts
import { $ } from "bun";
import { Glob } from "bun";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import pc from "picocolors";
import { loadOhEnv } from "../../env.ts";
import { banner } from "../../shared/banner.ts";
import { GRADIENTS } from "../../shared/banner-presets.ts";

const HOME = os.homedir();
const CLAUDE = path.join(HOME, ".claude");

type Status = "ok" | "warn" | "fail";

export type Check = {
  group: string;
  name: string;
  status: Status;
  detail: string;
  fix?: string;
};

// ──────────────────────────────────────────────────────────────────────────────
// Environment checks
// ──────────────────────────────────────────────────────────────────────────────

async function checkEnv(checks: Check[]): Promise<void> {
  // bun on PATH
  try {
    const v = (await $`bun --version`.quiet().text()).trim();
    checks.push({
      group: "env",
      name: "bun",
      status: "ok",
      detail: `v${v}`,
    });
  } catch {
    checks.push({
      group: "env",
      name: "bun",
      status: "fail",
      detail: "not on PATH",
      fix: "install bun: curl -fsSL https://bun.sh/install | bash",
    });
  }

  // trash command (used by backup-now + oh-search delete + oh-context promote)
  try {
    await $`which trash`.quiet();
    checks.push({
      group: "env",
      name: "trash",
      status: "ok",
      detail: "available",
    });
  } catch {
    checks.push({
      group: "env",
      name: "trash",
      status: "warn",
      detail: "not on PATH",
      fix: "install: brew install trash (used by backup-now, oh-search delete, oh-context promote)",
    });
  }

  // fzf — optional, oh-nice picker uses it as preference
  try {
    await $`which fzf`.quiet();
    checks.push({
      group: "env",
      name: "fzf",
      status: "ok",
      detail: "available",
    });
  } catch {
    checks.push({
      group: "env",
      name: "fzf",
      status: "warn",
      detail: "not on PATH (oh-nice picker falls back to inquirer)",
      fix: "brew install fzf  (optional — nicer picker)",
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Directory checks
// ──────────────────────────────────────────────────────────────────────────────

async function checkDirs(checks: Check[]): Promise<void> {
  const required = [
    "agents",
    "skills",
    "context",
    "knowledges",
  ];
  for (const rel of required) {
    const abs = path.join(CLAUDE, rel);
    try {
      const st = await stat(abs);
      if (st.isDirectory()) {
        checks.push({
          group: "dirs",
          name: `~/.claude/${rel}/`,
          status: "ok",
          detail: "present",
        });
      } else {
        checks.push({
          group: "dirs",
          name: `~/.claude/${rel}/`,
          status: "fail",
          detail: "exists but is not a directory",
        });
      }
    } catch {
      checks.push({
        group: "dirs",
        name: `~/.claude/${rel}/`,
        status: "fail",
        detail: "missing",
        fix: `mkdir -p ${abs}`,
      });
    }
  }

  // workspaces/plan — optional but useful
  const workspaces = path.join(HOME, "workspaces", "plan");
  try {
    await stat(workspaces);
    checks.push({
      group: "dirs",
      name: "~/workspaces/plan/",
      status: "ok",
      detail: "present (oh-nice plans target)",
    });
  } catch {
    checks.push({
      group: "dirs",
      name: "~/workspaces/plan/",
      status: "warn",
      detail: "missing (auto-created on first oh-nice plan, this is fine)",
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// settings.json
// ──────────────────────────────────────────────────────────────────────────────

async function checkSettings(checks: Check[]): Promise<void> {
  const settingsPath = path.join(CLAUDE, "settings.json");
  try {
    const content = await readFile(settingsPath, "utf-8");
    JSON.parse(content);
    checks.push({
      group: "settings",
      name: "settings.json",
      status: "ok",
      detail: "valid JSON",
    });
  } catch (err) {
    checks.push({
      group: "settings",
      name: "settings.json",
      status: "fail",
      detail: `parse error: ${err instanceof Error ? err.message : String(err)}`,
      fix: "open ~/.claude/settings.json and validate JSON",
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CLAUDE.md
// ──────────────────────────────────────────────────────────────────────────────

async function checkClaudeMd(checks: Check[]): Promise<void> {
  const p = path.join(CLAUDE, "CLAUDE.md");
  try {
    const st = await stat(p);
    checks.push({
      group: "settings",
      name: "CLAUDE.md",
      status: "ok",
      detail: `present (${formatBytes(st.size)})`,
    });
  } catch {
    checks.push({
      group: "settings",
      name: "CLAUDE.md",
      status: "warn",
      detail: "missing — no global rules will apply",
      fix: "create ~/.claude/CLAUDE.md with workflow + hard rules",
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Agents
// ──────────────────────────────────────────────────────────────────────────────

async function checkAgents(checks: Check[]): Promise<void> {
  const dir = path.join(CLAUDE, "agents");
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return; // covered by dirs check
  }
  for (const f of entries) {
    if (!f.endsWith(".md")) continue;
    const abs = path.join(dir, f);
    const content = await readFile(abs, "utf-8");
    const fm = parseFrontmatter(content);
    if (!fm) {
      checks.push({
        group: "agents",
        name: f,
        status: "fail",
        detail: "no frontmatter (--- ... ---)",
      });
      continue;
    }
    const missing: string[] = [];
    if (!fm.name) missing.push("name");
    if (!fm.description) missing.push("description");
    if (missing.length > 0) {
      checks.push({
        group: "agents",
        name: f,
        status: "fail",
        detail: `missing required fields: ${missing.join(", ")}`,
      });
    } else {
      const extras: string[] = [];
      if (fm.tools) extras.push("tools");
      if (fm.model) extras.push(`model=${fm.model}`);
      if (fm.memory) extras.push(`memory=${fm.memory}`);
      if (fm.color) extras.push(`color=${fm.color}`);
      checks.push({
        group: "agents",
        name: f,
        status: "ok",
        detail: `${fm.name}${extras.length ? "  · " + extras.join(" · ") : ""}`,
      });
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Plugin node_modules (single install check)
// ──────────────────────────────────────────────────────────────────────────────

function checkPluginNodeModules(checks: Check[]): void {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? path.resolve(import.meta.dir, "../../..");
  const pluginNodeModules = path.join(pluginRoot, "node_modules");
  checks.push({
    group: "plugin",
    name: "plugin node_modules",
    status: existsSync(pluginNodeModules) ? "ok" : "fail",
    detail: existsSync(pluginNodeModules) ? pluginNodeModules : "missing — run: bun install",
    fix: existsSync(pluginNodeModules) ? undefined : `cd ${pluginRoot} && bun install`,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Shadow detection (old ~/.claude/skills/oh-* dirs)
// ──────────────────────────────────────────────────────────────────────────────

export function checkShadowDirs(checks: Check[]): void {
  const shadowed: string[] = [];
  const oldSkillDir = path.join(os.homedir(), ".claude", "skills");
  for (const s of ["oh-context", "oh-nice", "oh-search", "oh-doctor", "oh-help"]) {
    if (existsSync(path.join(oldSkillDir, s))) shadowed.push(s);
  }
  if (shadowed.length > 0) {
    checks.push({
      group: "plugin",
      name: "old skill dirs shadowing plugin",
      status: "warn",
      detail: `Found: ${shadowed.join(", ")} in ~/.claude/skills/. Plugin SKILL.md may be ignored.`,
      fix: `for s in ${shadowed.join(" ")}; do trash ~/.claude/skills/$s; done`,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// .oh-env loadability
// ──────────────────────────────────────────────────────────────────────────────

function checkOhEnv(checks: Check[]): OhEnvResult {
  let envOk = false;
  let envErr = "";
  let envVal: ReturnType<typeof loadOhEnv> | undefined;
  try {
    envVal = loadOhEnv();
    envOk = true;
  } catch (e) {
    envErr = e instanceof Error ? e.message : String(e);
  }
  checks.push({
    group: "config",
    name: ".oh-env loadable",
    status: envOk ? "ok" : "fail",
    detail: envOk ? "OK (project or ~/.claude/.oh-env found)" : envErr,
    fix: envOk ? undefined : "Run /oh init to scaffold .oh-env",
  });
  return { ok: envOk, env: envVal };
}

type OhEnvResult = { ok: boolean; env: ReturnType<typeof loadOhEnv> | undefined };

// ──────────────────────────────────────────────────────────────────────────────
// Env-dir existence checks (from loaded .oh-env)
// ──────────────────────────────────────────────────────────────────────────────

export function checkEnvDirs(checks: Check[], env: ReturnType<typeof loadOhEnv>): void {
  const pathKeys = ["CONTEXT_DIR", "CONTEXT_TEMPLATE_DIR", "KNOWLEDGE_DIR", "PLAN_DIR"] as const;
  for (const key of pathKeys) {
    const dir = env[key];
    if (!dir) continue;
    const exists = existsSync(dir);
    checks.push({
      group: "config",
      name: key,
      status: exists ? "ok" : "warn",
      detail: exists ? dir : `${dir} — missing (will be created on first use)`,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Agent-resolution best-effort check
// ──────────────────────────────────────────────────────────────────────────────

async function checkAgentResolution(
  checks: Check[],
  env: ReturnType<typeof loadOhEnv>,
): Promise<void> {
  const agentKeys = ["CODING_AGENT", "REVIEW_AGENT", "RESEARCH_AGENT"] as const;
  const agentDirs = [
    path.join(CLAUDE, "agents"),
    // plugin cache agents — best effort
  ];

  // Also scan plugin cache dirs for agents
  const cacheBase = path.join(CLAUDE, "plugins", "cache");

  for (const key of agentKeys) {
    const agentName = env[key];
    if (!agentName) continue;

    // Search ~/.claude/agents/<name>.md
    let found = false;
    for (const dir of agentDirs) {
      if (existsSync(path.join(dir, `${agentName}.md`))) {
        found = true;
        break;
      }
    }

    // Search plugin cache
    if (!found && existsSync(cacheBase)) {
      const glob = new Glob(`**/agents/${agentName}.md`);
      for await (const _match of glob.scan(cacheBase)) {
        found = true;
        break;
      }
    }

    checks.push({
      group: "config",
      name: `${key} → ${agentName}`,
      status: found ? "ok" : "warn",
      detail: found
        ? `${agentName}.md found in ~/.claude/agents/`
        : `${agentName}.md not found in ~/.claude/agents/ or plugin cache — agent may still work at runtime`,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

type Frontmatter = Record<string, string>;

export function parseFrontmatter(md: string): Frontmatter | null {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm: Frontmatter = {};
  for (const line of (m[1] ?? "").split("\n")) {
    const stripped = line.replace(/#.*$/, "").trim();
    if (!stripped) continue;
    const sepIdx = stripped.indexOf(":");
    if (sepIdx === -1) continue;
    const key = stripped.slice(0, sepIdx).trim();
    const val = stripped.slice(sepIdx + 1).trim().replace(/^["']|["']$/g, "");
    fm[key] = val;
  }
  return fm;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function statusIcon(s: Status): string {
  return s === "ok" ? "✅" : s === "warn" ? "⚠️" : "❌";
}

function statusColor(s: Status): (x: string) => string {
  return s === "ok" ? pc.green : s === "warn" ? pc.yellow : pc.red;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────────────────────────────────────

export async function run(_args: string[]): Promise<void> {
  banner({
    title: "[OH! >> DOCTOR!!]",
    gradient: GRADIENTS.doctor,
  });
  process.stderr.write(`${pc.magenta("◇")} ${pc.bold("oh-doctor")} — checking ~/.claude…\n`);

  const checks: Check[] = [];

  await checkEnv(checks);
  await checkDirs(checks);
  await checkSettings(checks);
  await checkClaudeMd(checks);
  await checkAgents(checks);
  checkPluginNodeModules(checks);
  checkShadowDirs(checks);

  // .oh-env loadability — must not throw; captured as a check row
  const { ok: envOk, env } = checkOhEnv(checks);

  if (envOk && env) {
    checkEnvDirs(checks, env);
    await checkAgentResolution(checks, env);
  }

  const okN = checks.filter((c) => c.status === "ok").length;
  const warnN = checks.filter((c) => c.status === "warn").length;
  const failN = checks.filter((c) => c.status === "fail").length;

  // Markdown report for Claude / user
  const lines: string[] = [];
  lines.push(`## 🩺 oh-doctor report`);
  lines.push("");
  lines.push(
    `**Summary:** ${okN} ✅ · ${warnN} ⚠️ · ${failN} ❌  (total ${checks.length})`,
  );
  lines.push("");

  const groups = [...new Set(checks.map((c) => c.group))];
  for (const g of groups) {
    const items = checks.filter((c) => c.group === g);
    lines.push(`### ${g}`);
    lines.push("");
    lines.push("| | Check | Detail |");
    lines.push("|:---:|:---|:---|");
    for (const c of items) {
      lines.push(
        `| ${statusIcon(c.status)} | \`${c.name}\` | ${c.detail}${c.fix ? ` <br/>↳ _fix:_ \`${c.fix}\`` : ""} |`,
      );
    }
    lines.push("");
  }

  if (failN > 0) {
    lines.push(
      `> ❌ **${failN} failure${failN === 1 ? "" : "s"}** — actionable fixes shown above.`,
    );
  } else if (warnN > 0) {
    lines.push(
      `> ⚠️ **${warnN} warning${warnN === 1 ? "" : "s"}** — non-blocking, but worth addressing.`,
    );
  } else {
    lines.push(`> ✅ **All clear** — setup looks healthy.`);
  }

  process.stdout.write(lines.join("\n") + "\n");

  // Exit code: 0 if no fails, 1 if any fail
  process.exit(failN > 0 ? 1 : 0);
}
