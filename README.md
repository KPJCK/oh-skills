# oh-skills

A multi-tool plugin that bundles six personal dev-cycle skills. Runs on
[Claude Code](https://docs.claude.com/en/docs/claude-code),
[Antigravity CLI (`agy`)](https://github.com/antigravityio/antigravity-cli), and
[OpenAI Codex](https://platform.openai.com/docs/codex) from one source tree:

| Skill              | What it does                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **oh-nice**        | Plan / update-plan / go / review / fix / do orchestration                                   |
| **oh-bug-tracing** | Fix a bug AND write a forensic `trace.md` — git archaeology + root-cause class + prevention |
| **oh-context**     | Dynamic context-rule loader (DO/DO NOT/Details rules per domain)                            |
| **oh-search**      | Local knowledge base — check before WebSearch on stable topics                              |
| **oh-doctor**      | Sanity-check the plugin installation                                                        |
| **oh-help**        | Reference card with your config substituted in                                              |

## Requirements

- [Bun](https://bun.com) — required runtime. Install:
  `curl -fsSL https://bun.sh/install | bash`.
- [Claude Code](https://docs.claude.com/en/docs/claude-code) — the harness this
  plugin loads into.
- Git — for cloning and for `/oh-nice`'s repo detection.
- `trash` CLI (recommended, optional) — used by `/oh-search delete` and the
  migration helpers. Install on macOS: `brew install trash`. Without it, those
  commands fall back to `rm` with a confirmation prompt.

## Install — marketplace

```
/plugin marketplace add KPJCK/oh-skills
/plugin install oh-skills
```

Then in any project:

```
/oh init      # scaffold .oh-env
/oh doctor    # verify install
/oh help      # see the reference
/oh version   # print release version + commit hash
```

## Install — manual (clone + ask Claude)

Useful when the marketplace mechanism is unavailable, or for forks. Run these
steps yourself, or hand them to a Claude Code session and ask it to perform
them.

```bash
# 1. Clone the repo to a stable path
git clone https://github.com/KPJCK/oh-skills ~/workspaces/oh-skills
cd ~/workspaces/oh-skills

# 2. Install the JS dependencies
bun install

# 3. Verify the CLI works on its own
bun src/cli.ts help
```

Then **inside Claude Code**, with your repo as the cwd:

```
/plugin marketplace add ~/workspaces/oh-skills
/plugin install oh-skills
/oh doctor
```

If you'd rather have an agent install this for you, open Claude Code, point it
at the cloned repo, and prompt:

> Read `README.md` in this repo and follow the **Install — manual (clone + ask
> Claude)** steps. Use the path I cloned to (`~/workspaces/oh-skills` unless
> told otherwise). After install, run `/oh doctor` and report any non-green
> rows.

The agent will: clone (if not already done), run `bun install`, add the local
path as a marketplace, install the plugin, scaffold `.oh-env` via `/oh init`,
and run `/oh doctor`. It should stop before deleting any pre-existing
`~/.claude/skills/oh-*` directories — you confirm those manually.

## Running on Antigravity CLI (agy)

oh-skills is a tri-target plugin: it runs on Claude Code,
[Antigravity CLI](https://github.com/antigravityio/antigravity-cli) (`agy`), and
OpenAI Codex from the same source tree.

### Install

Symlink (or copy) the repo into the path where agy looks for plugins, then
verify:

```bash
# Stage the plugin in agy's install location (discovery)
mkdir -p ~/.gemini/antigravity-cli/plugins
ln -sfn ~/workspaces/oh-skills ~/.gemini/antigravity-cli/plugins/oh-skills

# Create the shim anchor so SKILL.md shims can locate src/cli.ts at runtime
ln -sfn ~/workspaces/oh-skills ~/.oh-skills

# Confirm agy sees it
agy plugin list
```

You should see `oh-skills` and all six `oh-*` skills in the output. If you
prefer not to symlink, copy the directory instead:

```bash
cp -r ~/workspaces/oh-skills ~/.gemini/antigravity-cli/plugins/oh-skills
```

### How the plugin root is resolved

Every `skills/*/SKILL.md` shim uses a stateless, host-portable bash expression
to locate `src/cli.ts` at runtime:

```bash
${CLAUDE_PLUGIN_ROOT:-${ANTIGRAVITY_PLUGIN_ROOT:-${PLUGIN_ROOT:-$HOME/.oh-skills}}}
```

Probe order (first match wins, defined in `src/shared/plugin-root.ts`):

| Priority | Variable / path           | Set by                                                  |
| -------- | ------------------------- | ------------------------------------------------------- |
| 1        | `CLAUDE_PLUGIN_ROOT`      | Claude Code (always set when a plugin runs there)       |
| 2        | `ANTIGRAVITY_PLUGIN_ROOT` | Reserved for a future agy release — not set today       |
| 3        | `PLUGIN_ROOT`             | Reserved; no known host sets this in skill context      |
| 4        | `$HOME/.oh-skills`        | Unified anchor symlink (shared by agy + Codex installs) |

**Key finding from the agy spike:** agy v1.0.3 injects no plugin-root env var
(confirmed via binary forensics — see `findings.md`). The shim therefore falls
through to the `~/.oh-skills` anchor, which is why the install above creates it.
The TypeScript resolver additionally probes known install paths (`~/.oh-skills`,
`~/plugins/oh-skills`, `~/.gemini/antigravity-cli/plugins/oh-skills`) for its
own internal path needs.

### Behavior differences on agy

| Aspect                  | Claude Code                                                   | agy                                                                                                           |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Agent dispatch          | Named subagents (Mirai / Yama / Rudy) when configured         | Dynamic subagents only — agy composes subagents itself                                                        |
| `oh-nice go/review/fix` | Dispatches `CODING_AGENT` / `REVIEW_AGENT` / `RESEARCH_AGENT` | Falls back to `self_act`; main agy agent does the work and may spawn its own dynamic subagents via the prompt |
| `.oh-env` agent vars    | Used                                                          | Ignored (no named-agent dispatch on agy)                                                                      |

In short: `oh-nice` works on agy, but all roles are handled by the main agent
rather than delegated to named subagents. The planning, review, and fix
workflows are otherwise identical.

### Reference

- Spike findings (env vars, SKILL.md load, custom-agent support) were recorded
  during development and are not shipped with the plugin; the probe-order table
  above captures the key results.
- Host detection logic: `src/env.ts` — `detectHost()`, signals on
  `ANTIGRAVITY_AGENT` / `ANTIGRAVITY_CONVERSATION_ID`
- Plugin-root resolver: `src/shared/plugin-root.ts` — `resolvePluginRoot()`,
  `SHIM_ROOT_EXPR`, `AGY_ROOT_ENV`

---

## Running on OpenAI Codex

oh-skills is a tri-target plugin: it runs on Claude Code, Antigravity CLI (agy),
and OpenAI Codex from the same source tree.

### Install

```bash
bash scripts/install-codex.sh
```

The script is idempotent — safe to run multiple times. It performs four steps:

1. Creates `~/.oh-skills` → repo symlink (the shim anchor — see below).
2. Creates `~/plugins/oh-skills` → repo symlink (Codex marketplace lookup path).
3. Writes `~/.agents/plugins/marketplace.json` with a personal marketplace entry
   (skipped if the file already exists).
4. If `codex` CLI is present: runs the cache-buster and registers
   `oh-skills@personal`. Otherwise it prints the manual steps.

After install, start a **new Codex thread** to pick up the skills — Codex loads
plugins at thread initialization, not mid-session.

### How the plugin root is resolved on Codex

Codex injects no plugin-root variable into running skills, and its validator
rejects `hooks` entries, so a hook-based approach is not available. Instead, the
SKILL.md shims use a stateless bash expression:

```bash
${CLAUDE_PLUGIN_ROOT:-${ANTIGRAVITY_PLUGIN_ROOT:-${PLUGIN_ROOT:-$HOME/.oh-skills}}}
```

On Codex none of `CLAUDE_PLUGIN_ROOT`, `ANTIGRAVITY_PLUGIN_ROOT`, or
`PLUGIN_ROOT` is set in skill context, so the expression resolves to
`$HOME/.oh-skills` — the symlink created by `install-codex.sh`. This is why the
anchor is the most important step.

| Priority | Variable / path           | Set by                                               |
| -------- | ------------------------- | ---------------------------------------------------- |
| 1        | `CLAUDE_PLUGIN_ROOT`      | Claude Code                                          |
| 2        | `ANTIGRAVITY_PLUGIN_ROOT` | Reserved for a future agy release                    |
| 3        | `PLUGIN_ROOT`             | Reserved; Codex forbids hooks, where it would appear |
| 4        | `$HOME/.oh-skills`        | Symlink created by `install-codex.sh` (Codex anchor) |

### Behavior differences on Codex

| Aspect                  | Claude Code                                                   | Codex                                                   |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Agent dispatch          | Named subagents (Mirai / Yama / Rudy) when configured         | Falls back to `self_act` — Codex uses dynamic subagents |
| `oh-nice go/review/fix` | Dispatches `CODING_AGENT` / `REVIEW_AGENT` / `RESEARCH_AGENT` | Main Codex agent does the work                          |
| Host detection          | `CLAUDE_PLUGIN_ROOT` / `CLAUDECODE`                           | `CODEX_HOME` (best-effort; `unknown` if absent)         |

In short: `oh-nice` works on Codex, but all roles are handled by the main agent
rather than delegated to named subagents. The planning, review, and fix
workflows are otherwise identical.

### Skill compatibility on Codex

Codex's plugin validator requires `disable-model-invocation` to be `false` or
absent. The utility skills (`oh-context`, `oh-search`, `oh-doctor`, `oh-help`)
satisfy this and load on Codex. The two action/orchestration skills (`oh-nice`,
`oh-bug-tracing`) intentionally keep `disable-model-invocation: true` to stay
user-only on Claude Code, so Codex's strict validator does not ingest them.
Drive those flows directly on Codex if you need them there.

---

## Uninstall

```
/plugin uninstall oh-skills
/plugin marketplace remove oh-skills          # or the local-path equivalent
```

To also remove configuration and data:

```bash
# user-global config (skip if you only used per-project .oh-env)
rm ~/.claude/.oh-env

# per-project config (in each project you used /oh init on)
rm <project>/.oh-env

# generated data — ONLY if you don't want to keep your rules/knowledge/plans
trash ./.oh                                   # or your custom CONTEXT_DIR / KNOWLEDGE_DIR / PLAN_DIR
```

If you cloned the repo manually:

```bash
trash ~/workspaces/oh-skills
```

## Configuration — `.oh-env`

`/oh init` scaffolds either `./.oh-env` (project, gitignored) or
`~/.claude/.oh-env` (user-global). Project values override home values per-key.
Process environment variables override both.

```bash
CONTEXT_DIR=./.oh/context              # rule-*.md storage
CONTEXT_TEMPLATE_DIR=./.oh/context-templates  # rule-set presets
KNOWLEDGE_DIR=./.oh/knowledge          # search-*.md storage
PLAN_DIR=./.oh/plan                    # <repo>/<slug>/{spec,plan,review}.md

CODING_AGENT=      # optional; empty = main Claude implements
REVIEW_AGENT=      # optional; empty = main Claude reviews
RESEARCH_AGENT=    # optional; empty = main Claude researches
```

If you have a personal implementer/reviewer (e.g. registered as a sub-agent in
Claude Code), set the env vars. Otherwise leave them empty and the main
conversation handles those roles.

## Skills at a glance

### oh-nice

```
/oh-nice plan "<feature description>"         → brainstorm + write spec.md + plan.md
/oh-nice update-plan "<new request>"          → append updates to an existing plan
/oh-nice go                                   → implement
/oh-nice review                               → review the changes against the plan
/oh-nice fix                                  → apply the latest review feedback
/oh-nice do "<one-shot request>"              → implement → review → fix without any plan artifacts
```

### Parallel execution (DAG-driven)

Plans authored via `/oh-nice plan` now include per-task `**Files:**` and
`**Depends-on:**` annotations. When `/oh-nice go` sees these, it parses the plan
into a dependency DAG, validates it (cycle detection, file-collision checks),
and dispatches multiple coding agents concurrently for tasks whose dependencies
are met. Concurrency is capped at 3 by default (override with
`OH_NICE_MAX_PARALLEL`).

Plans without DAG annotations fall back to the original single-agent sequential
mode — no migration required.

Use `do` for quick one-shot tasks that don't need a stored plan. It runs the
same implement → review → fix loop but writes no artifacts under `PLAN_DIR`. Opt
out of later phases with `--no-review` or `--no-fix`:

```
/oh-nice do "rename foo to bar"
  → coding agent implements + commits
  → review agent checks diff vs origin/main, writes findings to os.tmpdir()
  → fix agent applies findings, tmp file deleted
  → done

/oh-nice do "add a TODO comment" --no-review
  → coding agent implements; review and fix skipped

/oh-nice do "add a TODO comment" --no-fix
  → coding agent implements + commits
  → review agent checks diff and writes findings
  → fix skipped; findings available for manual action
```

Both `plan` and `update-plan` include an **optional research step** after
brainstorming. When prompted, choose a source mode:

| Mode        | Behaviour                                                                                |
| ----------- | ---------------------------------------------------------------------------------------- |
| `knowledge` | Searches the local oh-search knowledge base only; leaves spec.md unchanged if no matches |
| `online`    | Skips local search; uses WebSearch + WebFetch directly (3-5 sources per topic)           |
| `auto`      | Local-first; falls back to web for topics with no local hit                              |

The research agent appends a `## Research` section (or a `### Research`
subsection under the latest `## Update` block for `update-plan`) to `spec.md`.
When online research is performed, you are asked whether to save findings to the
knowledge base before writing the plan.

### oh-bug-tracing

```
/oh-bug-tracing fix "<bug description or pasted error/log>"
  → phase 1: coding agent fixes the bug
  → phase 2: main thread does git archaeology — finds the introducing commit,
             reconstructs the original dev's intent, classifies root cause,
             writes structured trace.md to PLAN_DIR/<repo>/<bug-slug>/trace.md
```

The `trace.md` template has eight enforced sections: Symptom · Fix · Origin
(commit/PR) · Dev intent at the time · Why this slipped · Root cause class ·
Prevention (TODO checkboxes) · External research. Use this when an ad-hoc bug
deserves to leave behind institutional memory, not just a fix.

### oh-context

```
/oh-context load                              → pick context folders, inject their rules
/oh-context list                              → list available folders
/oh-context check                             → drift detector — verify Claude still has the rules
/oh-context add                               → scaffold a new rule-*.md
/oh-context promote --all                     → convert drafts (.md) to rule-*.md
```

### oh-search

```
/oh-search find "<query>"                     → check the local knowledge base first
/oh-search research "<query>"                 → directive to WebSearch + save after YES confirm
/oh-search list                               → browse what's saved
```

## Development

```bash
git clone https://github.com/KPJCK/oh-skills
cd oh-skills
bun install
bun test
```

Local install for development:

```
/plugin marketplace add /absolute/path/to/oh-skills
/plugin install oh-skills
```

## Repo rules (for contributors and AI agents)

These rules apply to every change made to this repository.

1. **Always update `CHANGELOG.md`.** Every code-changing commit MUST append at
   least one entry under the `## [Unreleased]` heading, grouped into `Added` /
   `Changed` / `Fixed` / `Removed` subheadings. We use the
   [Keep a Changelog](https://keepachangelog.com/) format. CHANGELOG-only
   commits do not need to update CHANGELOG.md.
2. **Version sync.** `package.json` and `.claude-plugin/plugin.json` must carry
   the same `version`. CI fails if they drift (`scripts/check-version.ts`).
3. **No hardcoded paths or agent names** in `src/`. Every path comes from
   `.oh-env` via `loadOhEnv()`; every agent role from `resolveAgent(role, env)`.
4. **Tests first** for new behavior in `src/env.ts`, `src/cli.ts`,
   `src/shared/`. Port-only changes can skip TDD when the test already exists.
5. **Bun-only.** No Node-only APIs that don't work on Bun; no
   `npm`/`pnpm`/`yarn` scripts.

## Long-session token health

Token context fills up over a long session. Compact before it impacts quality.

**Caps (post-compaction estimates):**

- Single skill invocation: ~5K tokens.
- Combined re-attach budget: ~25K (newest-first on re-attach).
- Hit either cap → compact before the next heavy command.

**When to compact:** after `go` finishes, after `review` returns, or whenever
`/oh-nice` responses feel sluggish.

**How to compact:**

```
/compact focus on <current-task>
```

Focus hint keeps relevant context; everything else compresses.

**Compact-instructions block** — paste into the conversation after any compact
to restore skill state:

```
## Compact Instructions

Skills active: oh-nice / oh-bug-tracing / oh-context / oh-search / oh-doctor / oh-help.
Run: bun ${CLAUDE_PLUGIN_ROOT}/src/cli.ts <skill> <subcommand> [flags].
Sentinel: __OH_NICE_NEXT_ACTIONS__<json> (stderr last line) — parse and execute.
Env: PLAN_DIR / CONTEXT_DIR / KNOWLEDGE_DIR / CODING_AGENT / REVIEW_AGENT from .oh-env.
Next action: [fill in what you were doing].
```

**Proactive context reload:** after compact, run `/oh-context check` to verify
rules survived. If not, `/oh-context load` to reload.

## License

MIT
