# 🌸 oh-\* — your personal Claude Code toolkit

A family of skills and working sub-agents that turn `~/.claude/` into a
token-efficient, opinionated dev workbench. Nothing loads by default — you pull
what you need.

---

## Configuration (.oh-env)

| Key                    | Value                        | Purpose                                     |
| ---------------------- | ---------------------------- | ------------------------------------------- |
| `CONTEXT_DIR`          | `{{CONTEXT_DIR}}`            | Where rule files (rule-\*.md) live          |
| `CONTEXT_TEMPLATE_DIR` | `{{CONTEXT_TEMPLATE_DIR}}`   | Where saved rule-set presets (\*.json) live |
| `KNOWLEDGE_DIR`        | `{{KNOWLEDGE_DIR}}`          | Where knowledge files (search-\*.md) live   |
| `PLAN_DIR`             | `{{PLAN_DIR}}`               | Where plan dirs (<repo>/<slug>/) live       |
| `CODING_AGENT`         | `{{CODING_AGENT_OR_SELF}}`   | Used by `nice go` / `nice fix`              |
| `REVIEW_AGENT`         | `{{REVIEW_AGENT_OR_SELF}}`   | Used by `nice review`                       |
| `RESEARCH_AGENT`       | `{{RESEARCH_AGENT_OR_SELF}}` | Used by `search research`                   |

---

## Skills at a glance

| Skill                 | Purpose                                                    | Subcommands                                                                             |
| --------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **`/oh-nice`**        | dev cycle: brainstorm → iterate → implement → review → fix | `plan` · `update-plan` · `go` · `review` · `fix`                                        |
| **`/oh-bug-tracing`** | fix a bug + write forensic trace.md                        | `fix`                                                                                   |
| **`/oh-context`**     | per-domain rule library                                    | `load` · `list` · `check` · `huh` · `add` · `update` · `promote` · `clear` · `template` |
| **`/oh-search`**      | offline research knowledge base                            | `find` · `research` · `add` · `update` · `delete` · `list`                              |
| **`/backup-now`**     | snapshot `~/.claude/` (max 3 retained)                     | _(no subcommands)_                                                                      |
| **`/oh-doctor`**      | sanity-check the whole setup                               | _(no subcommands)_                                                                      |
| **`/oh-help`**        | this guide                                                 | _(no subcommands)_                                                                      |

## Sub-agents at a glance

| Agent                    | Role                                      | Color   | Model  | Memory     |
| ------------------------ | ----------------------------------------- | ------- | ------ | ---------- |
| **`{{CODING_AGENT}}`**   | implementer (React/Vite/TS, Bun, Rust)    | 🌸 pink | sonnet | persistent |
| **`{{REVIEW_AGENT}}`**   | code reviewer (read-only on code)         | 🟥 red  | sonnet | persistent |
| **`{{RESEARCH_AGENT}}`** | researcher (`/oh-search` first, then web) | 🔵 blue | sonnet | persistent |

The main thread (Opus 4.7) orchestrates; sub-agents do the bulk of the work on
Sonnet for cost/speed.

---

## `/oh-nice` — dev cycle

Wraps the `superpowers` plugin's brainstorming / writing-plans /
subagent-driven-development / code-review skills with your path convention
(`{{PLAN_DIR}}/<repo>/<slug>/`) and routes to {{CODING_AGENT}} (build) and
{{REVIEW_AGENT}} (review).

### Subcommands

- **`/oh-nice plan [request]`** — phased: brainstorm interview → name the plan →
  optional research step → write `plan.md`. Asks "implement now or stop" at the
  end.
- **`/oh-nice update-plan [request]`** — iterate an existing plan: pick plan →
  tight brainstorm scoped to the change → append `## Update — YYYY-MM-DD` to
  `spec.md` → optional research step → write new-tasks section to `plan.md`.
  Asks "implement now or stop" at the end. Use this for new ideas, improvements,
  refactoring asks, or applying review feedback.

  **Optional research step** (both `plan` and `update-plan`): after
  brainstorming, you are asked "Run research before writing the plan?" with
  three source modes:

  | Mode        | What the research agent does                                                                                       |
  | ----------- | ------------------------------------------------------------------------------------------------------------------ |
  | `knowledge` | Searches the local oh-search knowledge base only; no web calls; leaves spec.md unchanged if nothing relevant found |
  | `online`    | Skips local search; uses WebSearch + WebFetch (3-5 sources per topic)                                              |
  | `auto`      | Local-first via oh-search; falls back to web for topics with no local hit                                          |

  Findings are appended as `## Research` to `spec.md` (or `### Research` under
  the latest `## Update — YYYY-MM-DD` block for `update-plan`). If web research
  was performed, you are asked "Save these findings to the knowledge base?"
  before writing-plans runs.

- **`/oh-nice go [--slug X]`** — picker (or pre-selected) → {{CODING_AGENT}}
  executes the plan task-by-task via `superpowers:subagent-driven-development`.
- **`/oh-nice review`** — picker → ask scope (uncommitted / last N commits /
  whole branch vs main) → dispatch {{REVIEW_AGENT}} with git refs.
  {{REVIEW_AGENT}} appends `## Round N — YYYY-MM-DD` to `review.md`.
- **`/oh-nice fix`** — picker (filtered to plans with `review.md`) → dispatch
  {{CODING_AGENT}} with the latest review round → {{CODING_AGENT}} implements
  Critical+Important, leaves Minor as TODOs unless trivial.
- **`/oh-nice do [request] [--no-review] [--no-fix]`** — JFDI one-shot:
  implement → review → fix without creating any spec.md/plan.md/review.md
  artifacts. Three phases: `init` (dispatch coding agent), `post-implement`
  (dispatch review agent, findings to os.tmpdir()), `post-review` (dispatch fix
  agent if findings exist, delete tmp file). `--no-review` skips both review and
  fix; `--no-fix` dispatches reviewer but stops before fix.

### Artifacts

| File                                   | Written by                            |
| -------------------------------------- | ------------------------------------- |
| `{{PLAN_DIR}}/<repo>/<slug>/spec.md`   | `superpowers:brainstorming`           |
| `{{PLAN_DIR}}/<repo>/<slug>/plan.md`   | `superpowers:writing-plans`           |
| `{{PLAN_DIR}}/<repo>/<slug>/review.md` | {{REVIEW_AGENT}} (appended per round) |

**Accumulating sections:** Both `spec.md` and `plan.md` grow
`## Update — YYYY-MM-DD` sections each time you run `/oh-nice update-plan`.
`plan.md` also grows a sibling `## Notes` H2 at the very bottom, populated by
{{CODING_AGENT}} during `/oh-nice go` whenever it discovers something worth
recording.

**Review file format:** `/oh-nice review` writes round sections
(`## Round N — YYYY-MM-DD`) whose findings are
`- [ ] **[severity]** <statement>` checkboxes, each with indented
`Where / Why / Suggested fix` sub-bullets. `/oh-nice fix` flips these to `- [x]`
with a `**fixed:** …` / `**wont-fix:** …` / `**reviewer-wrong:** …` /
`**not-applicable:** …` / `**deferred:** …` status tag appended after an
em-dash.

### Typical use

```
/oh-nice plan "add password reset flow"
  → answer brainstorm questions, name it "add-password-reset"
  → plan written, "implement now?" → yes
  → {{CODING_AGENT}} builds

/oh-nice update-plan "tighten password rules"
  → tight brainstorm scoped to the new ask
  → spec.md + plan.md gain ## Update — YYYY-MM-DD sections
  → "implement now?" → yes → {{CODING_AGENT}} builds the new tasks

/oh-nice review
  → CHANGES_REQUESTED, 2 Critical

/oh-nice fix
  → {{CODING_AGENT}} applies fixes

/oh-nice review   (round 2)
  → APPROVE_WITH_NITS  ✅
```

---

## `/oh-bug-tracing` — fix + forensic trace

Ad-hoc bug fix with a structured post-mortem. Two phases:

1. **fix** — dispatch {{CODING_AGENT}} to apply the minimal fix.
2. **trace** — main thread does git archaeology, classifies root cause, writes
   `trace.md`.

Outcome: bug gone + forensic record under `{{PLAN_DIR}}/<repo>/<slug>/trace.md`.

### Subcommands

- **`/oh-bug-tracing fix "<bug description>" [--slug=<name>]`** — run both
  phases in sequence.

  Slug is auto-derived from the first 5–6 words of the description. Override
  with `--slug=<name>`.

### Artifacts

| File                                  | Written by                |
| ------------------------------------- | ------------------------- |
| `{{PLAN_DIR}}/<repo>/<slug>/trace.md` | main thread (trace phase) |

### trace.md sections

`Symptom` · `Fix` · `Origin` · `Dev intent at the time` · `Why this slipped` ·
`Root cause class` · `Prevention` · `External research`

### Root cause classes

`typo` · `off-by-one` · `wrong-abstraction` · `missing-validation` · `race` ·
`API-misuse` · `stale-cache` · `type-coercion` · `other`

### Typical use

```
/oh-bug-tracing fix "off-by-one in pagination calculates wrong last page"
  → {{CODING_AGENT}} fixes the bug
  → main thread investigates: git blame → commit log → root cause
  → writes trace.md with all sections
  → terse summary: off-by-one bug · trace at ~/workspaces/plan/my-repo/off-by-one-in-pagination-calculates/trace.md · next: add regression test
```

---

## `/oh-context` — rule library

Per-domain rules that live at `{{CONTEXT_DIR}}/<topic>/rule-*.md`. Lazy
injection: you explicitly `load` the rules relevant to your current task. The
picker pre-selects last picks for the current cwd, so repeat work is one-Enter.

### Rule file shape

Files must be named `rule-<slug>.md`, frontmatter + body:

```markdown
---
title: <human title>
description: <one-liner>
priority: low | medium | high
---

# <title>

## DO

- ...

## DO NOT

- ...

## Details

<optional nuance — delete if not needed>
```

### Subcommands

- **`/oh-context load`** (default) — checkbox picker for folders. Pre-selected
  from cache. Injects rendered DO/DO NOT/Details for selected rules. The picker
  shows `~N tok` per folder so you can gauge context size before loading.
- **`/oh-context load --template <name>`** — load a saved preset directly (no
  folder picker). Templates live at `{{CONTEXT_TEMPLATE_DIR}}/<name>.json`.
- **`/oh-context list`** — markdown table of all folders, rule counts, and
  Loaded ✅/⬜ per folder.
- **`/oh-context check`** — sanity-check that loaded rules are still in your
  context (defends against drift on long sessions). Asks Claude to honestly
  quote a DO and DO NOT verbatim for each loaded rule.
- **`/oh-context huh`** — single-purpose probe: prints `true`/`false` for
  whether any rules are loaded for the current cwd; exit code mirrors (0 for
  true, 1 for false).
- **`/oh-context add`** — interactive scaffold for a new `rule-*.md` from the
  template. Opens in `$EDITOR` after writing.
- **`/oh-context add --template <name>`** — multi-select rule files (each
  labeled with `~N tok`) to build a new preset at
  `{{CONTEXT_TEMPLATE_DIR}}/<name>.json`.
- **`/oh-context update <folder>/<name>`** — print current rule + Edit-tool
  directive for Claude to apply user's verbal change requests.
- **`/oh-context promote [--all | --target <path>]`** — interview-driven
  conversion of draft `.md` files (any name, any content) into one or more new
  rules and/or extensions to existing rules. Trashes the draft when done.
- **`/oh-context clear`** — directive: Claude disregards previously injected
  rules for the rest of the session.
- **`/oh-context template list`** — table: name · rule count · total tokens ·
  created.
- **`/oh-context template show <name>`** — table of resolved rules: title · path
  · tokens. Marks any unresolved rule with ❌ missing.
- **`/oh-context template delete <name>`** — trash the template JSON (confirms
  in TTY; `--yes` for non-TTY).

### Template file shape

Stored at `{{CONTEXT_TEMPLATE_DIR}}/<name>.json`:

```json
{
  "templateName": "frontend-feature",
  "createdAt": "2026-05-18T03:00:00Z",
  "context": [
    { "name": "React hooks", "path": "typescript/frontend/rule-react-hooks.md" }
  ]
}
```

`path` is relative to `{{CONTEXT_DIR}}/`. `name` is the rule's `title` captured
at template-creation time (display only — resolution always uses `path`).

### Hard rule

`rule-*.md` files must **never** be created manually. Always go through `add`,
`update`, or `promote`. Any other `.md` you drop in a folder is treated as a
draft (ignored by `load`, found by `promote`).

---

## `/oh-search` — research knowledge base

Your offline reference library at `{{KNOWLEDGE_DIR}}/<topic>/`. Before
WebSearching a stable reference topic, {{RESEARCH_AGENT}} (or you) runs `find`
here first. After researching, save the result so next time it's local.

### Knowledge file shape

Simple (`search-<name>.md`) or folder-shaped (`search-<name>/index.md` +
optional `images/`, `scripts/`, more `.md` files).

```markdown
---
title: <human title>
summary: <one-liner>
topic: <single-segment folder name>
tags: [t1, t2]
query: "<original query>"
sources:
  - https://...
created: 2026-05-16
updated: 2026-05-16
---

# <title>

(free-form markdown — Overview / Key concepts / Examples / Gotchas)
```

### Subcommands

- **`/oh-search find <query>`** — score local knowledge against the query (title
  +5, summary +3, tags +3, topic +2, query +1). Returns top 5 with age in days.
- **`/oh-search research <query>`** — emits a directive: Claude does
  `WebSearch` + `WebFetch` (3-5 quality sources), synthesizes, asks user "save?
  YES", then calls `add`.
- **`/oh-search add <name>` (YES-gated)** — persists new knowledge. **Refuses to
  write without `--confirmed`**. Claude must explicitly ask the user "save this
  as knowledge? reply YES" and only pass `--confirmed` if the literal answer is
  YES (case-insensitive).
- **`/oh-search update <topic>/<name>`** — print current + Edit-tool directive.
  Always bumps `updated:` to today.
- **`/oh-search delete <topic>/<name>`** — trash file or folder via `trash`.
- **`/oh-search list [--topic <topic>]`** — markdown table with shape icon,
  sources count, age.

### When auto-invoked by {{RESEARCH_AGENT}}

- **Reference-y** (docs, API patterns, framework conventions) → `find` first,
  fallback to web.
- **Time-sensitive** (news, latest releases, recent incidents) → skip `find`, go
  online directly.

---

## `/backup-now` — snapshot the setup

Bash script. One run = one dated backup under
`~/claude-backup/.claude-backup-DD-MM-YYYY[-N]/`. Max 3 retained, oldest
auto-trashed.

### Excludes (regenerable noise)

`node_modules`, `bun.lock`, plugin caches, `sessions`, `history.jsonl`,
`file-history`, `shell-snapshots`, `session-env`, `ide`, `cache`, `tasks`,
`downloads`, `backups`, `mcp-needs-auth-cache.json`.

### When to run

- Before destructive ops (rename, plugin uninstall, `rm -rf` nearby).
- Periodic maintenance (weekly).
- Before sharing the setup with a teammate (known-good restore point).

---

## `/oh-doctor` — sanity check

One-shot diagnostic. Runs ~20 checks across env, dirs, settings, agents, and
skills. Outputs a markdown table with ✅/⚠️/❌ per check and a `↳ fix:` hint for
any failures.

### What it checks

- `env`: bun, trash, fzf on PATH
- `dirs`: agents/, skills/, context/, knowledges/, workspaces/plan/
- `settings`: `settings.json` parses, `CLAUDE.md` present
- `agents`: each `.md` has valid frontmatter with required fields
- `skills`: each has `SKILL.md`, and if `package.json` exists then
  `node_modules` is installed

Exit `0` if no failures (warnings non-blocking), `1` if any failure.

---

## Sub-agents — when and how

### 🌸 {{CODING_AGENT}} (implementer)

Use for: any implementation work, applying review feedback, executing plan
tasks. Adapts to the repo's actual stack but defaults to React/Vite/TS, Bun,
Rust knowledge. TDD-aware, prefers `Edit` over `Write`, runs
tests/typecheck/lint after changes.

Auto-invoked by `/oh-nice go` and `/oh-nice fix`.

### 🟥 {{REVIEW_AGENT}} (reviewer)

Use for: code review against a plan. Read-only on code (`Edit` is explicitly
disallowed). Writes `review.md` with structured verdict (APPROVE /
APPROVE_WITH_NITS / CHANGES_REQUESTED / REWRITE). Supports multi-round reviews —
appends `## Round N`, never overwrites.

**Pre-review context check (FIRST action):** {{REVIEW_AGENT}} runs
`oh-context check`. If no rules loaded and the dispatch prompt doesn't say
"review-as-is", {{REVIEW_AGENT}} uses `AskUserQuestion` to ask: load rules first
/ proceed general / cancel. Cites rule paths when applying or flagging
deviations.

Auto-invoked by `/oh-nice review`.

### 🔵 {{RESEARCH_AGENT}} (researcher)

Use for: any "look up X" / "find info about Y" / "what's the current best
practice for Z" question. {{RESEARCH_AGENT}} runs `/oh-search find` first for
reference-y topics, only goes online if nothing local covers it. After online
research, asks user "save as knowledge? YES" before persisting (CLI enforces the
`--confirmed` gate too).

Dispatched by the main thread when knowledge is needed; should NOT do its own
implementation work (that's {{CODING_AGENT}}'s job).

---

## Typical workflows

### Start a new feature

```
1. /oh-context load              ← pick which rules apply
2. /oh-nice plan "add X"          ← brainstorm + write plan
3. /oh-nice go                    ← {{CODING_AGENT}} implements
4. /oh-nice review → /oh-nice fix ← {{REVIEW_AGENT}} reviews, {{CODING_AGENT}} applies
5. (loop 4 until APPROVE)
```

### Iterate on an existing plan

```
1. /oh-nice update-plan "tighten password validation"
   ↓ pick the plan you're iterating on
   ↓ tight brainstorm — 3-5 focused questions
   ↓ spec.md grows ## Update — YYYY-MM-DD
   ↓ writing-plans emits delta tasks → plan.md grows ## Update — YYYY-MM-DD
2. /oh-nice go   ← {{CODING_AGENT}} picks up new [ ] checkboxes, ignores done ones
3. /oh-nice review → /oh-nice fix   ← {{REVIEW_AGENT}} checkboxes + {{CODING_AGENT}} status flips
```

### Research a topic

```
ask Claude: "look up the current Bun WebSocket API"
  ↓
main dispatches {{RESEARCH_AGENT}}
  ↓
{{RESEARCH_AGENT}} runs /oh-search find "bun websocket"
  ↓
no local match → {{RESEARCH_AGENT}} runs WebSearch + WebFetch
  ↓
{{RESEARCH_AGENT}} asks user "save as knowledge? YES"
  ↓
user replies YES → {{RESEARCH_AGENT}} calls /oh-search add ... --confirmed
```

### Add a new rule from a draft note

```
drop {{CONTEXT_DIR}}/typescript/my-notes.md (any name, any content)
  ↓
/oh-context promote --target typescript/my-notes.md
  ↓
Claude reads, proposes per-section: (A) new rule / (B) extend existing / (C) discard
  ↓
agree with user, call /oh-context add for new + Edit-tool for extends
  ↓
trash the draft
```

### Check setup health

```
/oh-doctor              ← see ✅/⚠️/❌ table
```

### Snapshot before risky changes

```
/backup-now             ← ~21MB, max 3 retained
```

---

## Conventions across the family

- **CLI-driven, Claude-orchestrated.** Each TypeScript-based skill has a
  `cli.ts` that handles deterministic work (file ops, picker, paths) and emits
  either rendered markdown (for diagnostic/info) or a sentinel-prefixed JSON
  manifest (for dispatch/skill-invocation directives Claude executes).
- **Stdout = payload, stderr = status.** Decorative `· · ·` / `✓` lines go to
  stderr; the meaningful output (markdown or sentinel JSON) goes to stdout.
- **`oh-*` naming.** Family prefix so they group in the slash menu. Lean
  SKILL.md descriptions for the slash autocomplete; details live in the body (or
  here in oh-help).
- **TypeScript strict.** Each TS skill uses TS 6 with `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Bun runs `.ts`
  directly — no compile step.
- **Test coverage** (52 tests across 3 skills):
  `cd ${CLAUDE_PLUGIN_ROOT} && bun test`.
- **YES-gate** on `oh-search add` is the only hard explicit-confirmation
  requirement. Other write operations (oh-context add, oh-nice plan dir
  creation) just prompt naturally.

---

## File map

```
~/.claude/
├── CLAUDE.md                        ← global workflow + hard rules + personal context
├── agents/
│   ├── {{CODING_AGENT}}.md          ← implementer (pink, sonnet)
│   ├── {{REVIEW_AGENT}}.md          ← reviewer (red, sonnet)
│   ├── {{RESEARCH_AGENT}}.md        ← researcher (blue, sonnet)
│   └── clawko.md                    ← persona companion (untouched)
├── skills/
│   ├── oh-nice/                     ← dev cycle
│   ├── oh-context/                  ← rule library
│   ├── oh-search/                   ← knowledge base
│   ├── oh-doctor/                   ← diagnostic
│   ├── oh-help/                     ← this guide
│   └── backup-now/                  ← bash snapshot
├── context/<topic>/rule-*.md        ← rule library content
├── knowledges/<topic>/search-*.md   ← knowledge content
└── agent-memory/{{{CODING_AGENT}},{{REVIEW_AGENT}},{{RESEARCH_AGENT}}}/  ← harness-managed per-agent memory

{{PLAN_DIR}}/<repo>/<slug>/          ← oh-nice plan artifacts
├── spec.md
├── plan.md
└── review.md

~/claude-backup/                     ← backup-now snapshots (max 3)
```
