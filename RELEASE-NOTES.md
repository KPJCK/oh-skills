# Release notes

## 0.3.0

**Tri-target support: Claude Code + Antigravity CLI (`agy`) + OpenAI Codex**

oh-skills now runs natively on Claude Code, the `agy` CLI, and OpenAI Codex from
one source tree.

- Root `plugin.json` manifest — agy reads `skills/` path directly from the repo
  root; no separate installation step required once the plugin is linked.
- `.codex-plugin/plugin.json` manifest — native Codex plugin with a full
  `interface` block (displayName, capabilities, defaultPrompt, brandColor,
  etc.).
- Host-portable SKILL.md shims — every `bun .../src/cli.ts` call now uses a
  stateless bash probe expression
  (`${CLAUDE_PLUGIN_ROOT:-${ANTIGRAVITY_PLUGIN_ROOT:-$HOME/.oh-skills}}`) that
  works on all three hosts without pre-assignment.
- `scripts/install-codex.sh` — one-shot Codex registration: creates the
  `~/.oh-skills` symlink anchor (Codex injects no plugin-root var; hooks are
  forbidden by the Codex validator, so the shim must fall back to a known path),
  writes the personal marketplace entry, and runs `codex plugin add`.
- `detectHost()` function — detects `claude` vs `agy` vs `codex` vs `unknown`
  from environment markers.
- Host-aware agent dispatch — on Claude, `oh-nice` dispatches named subagents
  (Mirai/Yama/Rudy) as before; on agy and Codex it falls back to `self_act` so
  the host's own dynamic subagents take over.

**Manual agy install:** See the
[Running on Antigravity CLI](./README.md#running-on-antigravity-cli-agy) section
in the README for symlink/copy instructions and verification steps.

**Codex install:** Run `bash scripts/install-codex.sh` then start a new Codex
thread. See the [Running on OpenAI Codex](./README.md#running-on-openai-codex)
section in the README for details on the `~/.oh-skills` anchor and marketplace
registration.

See [CHANGELOG.md](./CHANGELOG.md) for the full per-item list.

## 0.2.0 — 2026-05-24

Major release. Highlights:

**New skills + subcommands**

- `oh-bug-tracing` skill — single-shot bug fix + forensic post-mortem.
  `/oh-bug-tracing fix "<bug>"` dispatches the coding agent, then the main
  thread does git archaeology and writes a structured `trace.md` (Symptom · Fix
  · Origin · Dev intent · Why this slipped · Root cause class · Prevention ·
  External research).
- `/oh-nice do` — JFDI implement → review → fix without spec/plan/review
  artifacts. Three phases driven by `--phase`; review findings live in
  `os.tmpdir()`. Supports `--no-review` and `--no-fix`.
- `/oh version` — prints `release <pkg.version> - <short-sha>`.

**Workflow enhancements**

- Optional research step in `/oh-nice plan` and `/oh-nice update-plan`. After
  brainstorming produces `spec.md`, the user is asked "Run research before
  writing the plan?" with three source modes: `knowledge` (local oh-search
  only), `online` (WebSearch + WebFetch), `auto` (local-first, web fallback).
- **Parallel-aware planning** — plan.md tasks declare `**Files:**` +
  `**Depends-on:**`, `oh-nice go` parses a DAG and dispatches concurrent coding
  agents per ready set (cap=3, configurable via `OH_NICE_MAX_PARALLEL`). Legacy
  plans without DAG fields fall back to single-agent sequential mode
  automatically.

**Performance + UX**

- Prompt cache optimization across nice subcommand prompts (role → workflow →
  paths order; ~46% reduction in `goPrompts.dispatched` size).
- Banner rewrite: single-line gradient title + subtitle with highlights; dropped
  bordered-ASCII rendering and cfonts dependency.
- Compact `report` messages, terse banner subtitles, header-line context-load
  output (~100 tok/load saved).

**Toolchain**

- Adopted `oxlint` + `oxfmt` as standard dev-dependencies, with configs adapted
  from the `new-ts-project` shared template. Lint baseline: 0 warnings.
  Repo-wide oxfmt pass applied (printWidth 100, trailing commas).
- Stripped `.ts` / `.tsx` extensions from 223 relative imports per
  `typescript/rule-shared-style`.

See [CHANGELOG.md](./CHANGELOG.md) for the full per-item list.

## 0.1.0 — Initial release

- Combine oh-context / oh-nice / oh-search / oh-doctor / oh-help into a single
  Claude Code plugin.
- Configuration via `.oh-env` (project, gitignored) or `~/.claude/.oh-env`
  (user-global).
- Agent abstraction: roles `coding` / `review` / `research` dispatch to
  env-configured sub-agents, or fall back to the main Claude conversation when
  unset.
- Slash commands: `/oh init`, `/oh doctor`, `/oh help`.
- Bun required.
