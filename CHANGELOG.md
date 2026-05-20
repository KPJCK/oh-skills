# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- `nice do` post-review phase: `hasUnchecked` regex now uses the `m` flag so findings preceded by a header are correctly detected instead of silently skipped.
- `nice do` init phase: `--no-fix` flag is now forwarded in the re-run command emitted to main Claude, so the post-implement phase honours the user's explicit opt-out.

### Added
- Test: `nice-do.test.ts` now covers `--no-fix` forwarding in the init-phase report (two cases: flag present and flag absent), and a multiline-regex regression guard for header-preceded findings.
- README: added `--no-fix` usage example to the `oh-nice do` typical-use snippet.
- `/oh-nice do` — single-shot implement → review → fix without spec.md/plan.md/review.md artifacts. Three phases (`init` / `post-implement` / `post-review`) driven by `--phase`; review findings live in `os.tmpdir()` and are deleted after the fix pass. Supports `--no-review` (skip both review and fix) and `--no-fix` (review-only). No `PLAN_DIR/<repo>/<slug>/` directory is ever created.
- Optional research step in `/oh-nice plan` and `/oh-nice update-plan`. After brainstorming produces `spec.md`, the user is asked "Run research before writing the plan?" with three source modes: `knowledge` (local oh-search only), `online` (WebSearch + WebFetch), `auto` (local-first, web fallback). Findings are appended to `spec.md` as `## Research` (or `### Research` under the latest `## Update` block for `update-plan`). Online research triggers a save-to-knowledge prompt before writing-plans runs.
- New phases `research-go` and `write-plan` in both `plan.ts` and `update-plan.ts`; `tmpSpec` threaded through the update-plan phase chain to preserve cleanup.
- Exported `buildResearchPrompt` helper in `plan.ts` (shared with `update-plan.ts`) that generates source-mode-specific prompts for both dispatched and self-act paths.
- Tests: `tests/nice-plan.test.ts` (new, 14 cases) covering research-go validation, action shapes, write-plan output, post-brainstorm ask_user; `tests/nice-update-plan.test.ts` extended with 11 new cases for the same phases plus tmpSpec threading.

### Changed
- `oh-context` SKILL.md: documents the expected "Reporting loaded rules" format Claude uses to summarize loaded rules after `load` / `list` / `check` — topic-prefixed opener, bullet list of `path (priority)` verbatim, echoed `Loaded at:` timestamp, one-line follow-up.
- Owner/repo references retargeted from `chaiyawutk/oh-skills` to `KPJCK/oh-skills` in README, `package.json`, `.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json`.
- Moved CI workflow from `.github/workflows/ci.yml` to `.github/workflows-pending/ci.yml` so the initial push doesn't require `workflow` OAuth scope. To re-enable: run `gh auth refresh -s workflow`, then `git mv .github/workflows-pending/ci.yml .github/workflows/ci.yml`, commit, push.

### Removed
- `cfonts` npm dependency (no longer used after banner rewrite).
- Legacy `banner()` function in `src/skills/nice/ui.ts` (callers now use `src/shared/banner.ts` directly).

## [0.2.0] — 2026-05-20

### Added
- `tests/prompts-shape.test.ts`: 6 cases locking cache-friendly prompt shape (stable role+workflow first, variable paths last).
- README: "Long-session token health" section — 5K/skill cap, 25K re-attach budget, paste-ready Compact Instructions block, `/compact focus on <topic>` usage.

### Changed
- `src/skills/nice/prompts.ts`: reordered all dispatched/selfAct prompts to `role → workflow → paths`. Variable content (paths, requests) moved last for prefix-cache stability. `goPrompts.dispatched` reduced from 424 → 230 chars (−46%).
- `src/skills/context/render.ts`: replaced 2-line narrative preamble with `## Authoritative rules · N rules · M folders` header (~100 tok/load saved).
- `src/skills/search/commands/find.ts`: dropped "How to use these" guidance block from stdout; table-only output.
- `src/skills/search/commands/list.ts`: removed emoji from header.
- `skills/oh-search/SKILL.md`: added `## Interpreting find / list output` section (moved guidance, terse style).
- `skills/oh-nice/SKILL.md`, `skills/oh-doctor/SKILL.md`, `skills/oh-help/SKILL.md`: added `disable-model-invocation: true` — proactive triggering disabled on user-only skills.
- `skills/oh-context/SKILL.md`: "Reporting loaded rules" template rewritten to header-line + bullets + next-action; dropped narrative framing.
- `src/skills/nice/commands/{go,review,fix,plan,update-plan,do}.ts`: compact `report` messages (`outcome → artifact · next: <cmd>`), terse banner subtitles (`<repo> · <agent> → <verb>`), noun-phrase `step`/`hint` strings.
- `src/skills/nice/ask-ui.ts`: terse question strings and description fragments in plan/scope pickers.

#### Token deltas

| Surface | Before | After | Δ |
|---|---|---|---|
| `goPrompts.dispatched` (chars) | 424 | 230 | −46% |
| `nice go --emit-ask-json` stderr+stdout (bytes) | 568 | 556 | −2% |

### Changed
- Rewrote `src/shared/banner.ts`: single-line gradient title + optional subtitle with `subtitleHighlights`. Dropped bordered-ASCII rendering, `shadeChar`, `measureWidth`, `gradientLine`. New `gradientText()` helper, `stripAnsi` preserved.
- Simplified `src/shared/banner-presets.ts`: now exports only `GRADIENTS` (5 per-skill color stops). Per-subcommand titles moved to call sites.
- oh-nice subcommands (plan, update-plan, go, review, fix) updated to single-line banner API: title baked in at call site, subtitle carries repo + context. go/review/fix show agent name in subtitle, highlighted in gradient.
- Removed `PRESETS` dependency from nice command files; now import `GRADIENTS` directly.
- `src/skills/nice/ui.ts` legacy `banner()` wrapper updated to use `GRADIENTS` (PRESETS removed); V.5 will remove cfonts/boxen.
- context/search/doctor/help `index.ts` entry points updated to single-line `banner({ title, gradient })` API; `PRESETS` import replaced with `GRADIENTS`.

### Added
- Marketplace manifest (`.claude-plugin/marketplace.json`) so `/plugin marketplace add <path-to-repo>` resolves; one plugin entry pointing at `./`.
- Bordered banners on context / search / doctor / help entry points with skill-specific gradient colors.
- Shared banner primitives (`src/shared/banner.ts`): `gradientLine`, `shadeChar`, `stripAnsi`, `measureWidth` with unit tests.
- `renderBanner()` and side-effect `banner()` in `src/shared/banner.ts` — 4-line bordered banner with gradient text + borders, cfonts `tiny` post-processed to shade chars, subtitle support.
- Per-skill banner presets (`src/shared/banner-presets.ts`) for nice (5 subcommands), context, search, doctor, help.
- GitHub Actions CI (`.github/workflows/ci.yml`) — `bun test` on ubuntu-latest + macos-latest, doctor smoke test, version-sync check.
- `scripts/check-version.ts` enforces package.json/plugin.json version sync.
- Initial `RELEASE-NOTES.md` for 0.1.0.
- Initial repo scaffold (package.json, tsconfig.json, .gitignore, LICENSE, README, CHANGELOG).
- Claude Code plugin manifest (.claude-plugin/plugin.json).
- `.oh-env` loader (`src/env.ts`) with project/home/defaults precedence, tilde/relative expansion, agent-role resolution.
- Tests for env loader (`tests/env.test.ts`, 12 cases).
- Shared next-action emitter (`src/shared/next-action.ts`) with per-skill sentinels and `buildAgentAction()` for dispatch-vs-self-act selection.
- Tests for next-action (`tests/next-action.test.ts`).
- CLI dispatcher (`src/cli.ts`) routing `<skill> <subcommand>` to nice/context/search/doctor/help/init.
- Shared UI helpers (`src/shared/ui.ts`).
- Skill stubs for nice/context/search/doctor/help; init command stub.
- CLI routing tests (`tests/cli-routing.test.ts`).
- Consolidated frontmatter parser (`src/shared/frontmatter.ts`) with `parseRule` and `parseKnowledge` typed wrappers.
- Tests for frontmatter parsing (`tests/frontmatter.test.ts`).
- Consolidated ask-ui payload builder (`src/shared/ask-ui.ts`) with generic bucketing for AskUserQuestion.
- Tests for ask-ui (`tests/ask-ui.test.ts`, 18 cases).
- Consolidated interactive picker helper (`src/shared/picker.ts`).
- oh-context registry, cache, tokens ported to `src/skills/context/`; reads `CONTEXT_DIR` from `loadOhEnv()`.
- Ported tests for context cache and tokens.
- oh-context `load` command ported to `src/skills/context/commands/load.ts`; supporting libs render, editor, templates, template, picker, ask-ui ported.
- oh-context commands list/check/add/update/promote/template/clear/huh ported to `src/skills/context/commands/`.
- oh-context dispatcher (`src/skills/context/index.ts`) routing all 9 subcommands; defaults to `load` when no sub or flag-first invocation.
- Ported tests: context-add-template-payload, context-huh, context-templates (11 cases total).
- oh-search registry/scoring/template ported to `src/skills/search/`; reads `KNOWLEDGE_DIR` from `loadOhEnv()`.
- Shared `ui.ts` extended with `success`, `hint`, `step`, `warn` functions (needed by search and context commands).
- Ported tests: search-scoring, search-template (24 cases).
- oh-search commands (find/research/add/update/delete/list) ported to `src/skills/search/commands/`.
- oh-search dispatcher (`src/skills/search/index.ts`) replacing stub.
- `research` command uses agent abstraction via `buildAgentAction` (role: research); emits `dispatch_agent` or `self_act` based on `RESEARCH_AGENT` env setting.
- Supporting libs ported locally to `src/skills/search/`: ask-ui.ts, picker.ts, prompts.ts.
- oh-nice repo/plans/picker libs ported to `src/skills/nice/`; `plans.ts` reads `PLAN_DIR` from `loadOhEnv()`.
- Ported tests: nice-repo, nice-plans, nice-update-plan, and nice-specific ask-ui tests (nice-ask-ui.test.ts).
- Paired dispatched/selfAct prompts for nice go/review/fix (`src/skills/nice/prompts.ts`).
- nice go command ported with role-based agent abstraction.
- Removed hardcoded "mirai" references from nice/go.ts.
- nice index.ts updated to route subcommands (go/review/fix/update-plan).
- nice review command ported; removed hardcoded "yama" reference; uses buildAgentAction.
- Removed hardcoded "yama" references from nice/review.ts.
- nice fix command ported with role-based agent abstraction.
- Removed hardcoded "mirai" references from nice/fix.ts.
- oh-nice `plan` command ported (phased brainstorm → writing-plans).
- oh-nice `update-plan` command verified/finalized (phased iteration of an existing plan); CLI literals updated to use `${CLAUDE_PLUGIN_ROOT}/src/cli.ts`.
- oh-nice dispatcher finalized (`src/skills/nice/index.ts`).

- HELP.md template (`templates/HELP.md`) with env-key placeholders and configuration table.
- Help renderer (`src/skills/help/index.ts`) substitutes env values into HELP.md template; supports optional section filter.
- `/oh init` command scaffolds `.oh-env` at project or `~/.claude/.oh-env`; appends `.oh-env` to project `.gitignore`.
- `templates/.oh-env.example` shipped as the scaffolded content.
- `/oh` slash command (`commands/oh.md`) registers init/doctor/help meta-commands.

- Thin SKILL.md shims for oh-nice, oh-context, oh-search, oh-doctor, oh-help. Operational details moved to HELP.md to reduce per-invocation context cost.

### Changed
- `src/skills/nice/ui.ts` `banner()` is now a thin forwarder to the shared `banner()`; cfonts no longer imported there.
- oh-nice subcommands (plan, update-plan, go, review, fix) use the new bordered banner with subcommand baked into the title; the legacy mode pill is gone.
- oh-doctor rewritten for new plugin layout: single plugin `node_modules` check, shadow-dir detection, `.oh-env` loadability check, agent-resolution best-effort check, env-dir existence checks.
- Replaced placeholder README with full public docs: requirements, marketplace + manual install, uninstall, configuration, skills overview, development guide, repo rules, license.
