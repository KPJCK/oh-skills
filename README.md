# oh-skills

A [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin that bundles five personal dev-cycle skills:

| Skill | What it does |
|---|---|
| **oh-nice** | Plan / update-plan / go / review / fix orchestration |
| **oh-context** | Dynamic context-rule loader (DO/DO NOT/Details rules per domain) |
| **oh-search** | Local knowledge base — check before WebSearch on stable topics |
| **oh-doctor** | Sanity-check the plugin installation |
| **oh-help** | Reference card with your config substituted in |

## Requirements

- [Bun](https://bun.com) — required runtime. Install: `curl -fsSL https://bun.sh/install | bash`.
- [Claude Code](https://docs.claude.com/en/docs/claude-code) — the harness this plugin loads into.
- Git — for cloning and for `/oh-nice`'s repo detection.
- `trash` CLI (recommended, optional) — used by `/oh-search delete` and the migration helpers. Install on macOS: `brew install trash`. Without it, those commands fall back to `rm` with a confirmation prompt.

## Install — marketplace

```
/plugin marketplace add chaiyawutk/oh-skills
/plugin install oh-skills
```

Then in any project:

```
/oh init     # scaffold .oh-env
/oh doctor   # verify install
/oh help     # see the reference
```

## Install — manual (clone + ask Claude)

Useful when the marketplace mechanism is unavailable, or for forks. Run these steps yourself, or hand them to a Claude Code session and ask it to perform them.

```bash
# 1. Clone the repo to a stable path
git clone https://github.com/chaiyawutk/oh-skills ~/workspaces/oh-skills
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

If you'd rather have an agent install this for you, open Claude Code, point it at the cloned repo, and prompt:

> Read `README.md` in this repo and follow the **Install — manual (clone + ask Claude)** steps. Use the path I cloned to (`~/workspaces/oh-skills` unless told otherwise). After install, run `/oh doctor` and report any non-green rows.

The agent will: clone (if not already done), run `bun install`, add the local path as a marketplace, install the plugin, scaffold `.oh-env` via `/oh init`, and run `/oh doctor`. It should stop before deleting any pre-existing `~/.claude/skills/oh-*` directories — you confirm those manually.

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

`/oh init` scaffolds either `./.oh-env` (project, gitignored) or `~/.claude/.oh-env` (user-global). Project values override home values per-key. Process environment variables override both.

```bash
CONTEXT_DIR=./.oh/context              # rule-*.md storage
CONTEXT_TEMPLATE_DIR=./.oh/context-templates  # rule-set presets
KNOWLEDGE_DIR=./.oh/knowledge          # search-*.md storage
PLAN_DIR=./.oh/plan                    # <repo>/<slug>/{spec,plan,review}.md

CODING_AGENT=      # optional; empty = main Claude implements
REVIEW_AGENT=      # optional; empty = main Claude reviews
RESEARCH_AGENT=    # optional; empty = main Claude researches
```

If you have a personal implementer/reviewer (e.g. registered as a sub-agent in Claude Code), set the env vars. Otherwise leave them empty and the main conversation handles those roles.

## Skills at a glance

### oh-nice

```
/oh-nice plan "<feature description>"         → brainstorm + write spec.md + plan.md
/oh-nice update-plan "<new request>"          → append updates to an existing plan
/oh-nice go                                   → implement
/oh-nice review                               → review the changes against the plan
/oh-nice fix                                  → apply the latest review feedback
```

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
git clone https://github.com/chaiyawutk/oh-skills
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

1. **Always update `CHANGELOG.md`.** Every code-changing commit MUST append at least one entry under the `## [Unreleased]` heading, grouped into `Added` / `Changed` / `Fixed` / `Removed` subheadings. We use the [Keep a Changelog](https://keepachangelog.com/) format. CHANGELOG-only commits do not need to update CHANGELOG.md.
2. **Version sync.** `package.json` and `.claude-plugin/plugin.json` must carry the same `version`. CI fails if they drift (`scripts/check-version.ts`).
3. **No hardcoded paths or agent names** in `src/`. Every path comes from `.oh-env` via `loadOhEnv()`; every agent role from `resolveAgent(role, env)`.
4. **Tests first** for new behavior in `src/env.ts`, `src/cli.ts`, `src/shared/`. Port-only changes can skip TDD when the test already exists.
5. **Bun-only.** No Node-only APIs that don't work on Bun; no `npm`/`pnpm`/`yarn` scripts.

## License

MIT
