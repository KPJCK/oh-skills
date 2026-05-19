# Release notes

## 0.1.0 — Initial release

- Combine oh-context / oh-nice / oh-search / oh-doctor / oh-help into a single Claude Code plugin.
- Configuration via `.oh-env` (project, gitignored) or `~/.claude/.oh-env` (user-global).
- Agent abstraction: roles `coding` / `review` / `research` dispatch to env-configured sub-agents, or fall back to the main Claude conversation when unset.
- Slash commands: `/oh init`, `/oh doctor`, `/oh help`.
- Bun required.
