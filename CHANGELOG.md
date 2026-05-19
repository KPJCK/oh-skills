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
