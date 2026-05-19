# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
