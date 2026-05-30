#!/usr/bin/env bash
# install-codex.sh — register oh-skills as an OpenAI Codex plugin
# Idempotent: safe to run multiple times.
set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve repo root from script location
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "oh-skills install-codex"
echo "  repo: $REPO"

# ---------------------------------------------------------------------------
# Step 1: ~/.oh-skills anchor — canonical shim resolution fallback
# ---------------------------------------------------------------------------
# Codex injects no plugin-root variable into skills (and its validator forbids
# hooks), so the SKILL.md shims fall back to $HOME/.oh-skills via the portable
# expression:
#   ${CLAUDE_PLUGIN_ROOT:-${ANTIGRAVITY_PLUGIN_ROOT:-${PLUGIN_ROOT:-$HOME/.oh-skills}}}
# This symlink makes that path point to the real repo.
ln -sfn "$REPO" "$HOME/.oh-skills"
echo "  linked: $HOME/.oh-skills -> $REPO"

# ---------------------------------------------------------------------------
# Step 2: ~/plugins/oh-skills — Codex personal-marketplace lookup path
# ---------------------------------------------------------------------------
mkdir -p "$HOME/plugins" "$HOME/.agents/plugins"
ln -sfn "$REPO" "$HOME/plugins/oh-skills"
echo "  linked: $HOME/plugins/oh-skills -> $REPO"

# ---------------------------------------------------------------------------
# Step 3: Personal marketplace entry
# ---------------------------------------------------------------------------
# The repo ships the canonical template at .agents/plugins/marketplace.json. Its
# "./plugins/oh-skills" source path resolves correctly once copied to
# ~/.agents/plugins/ (where it points at the ~/plugins/oh-skills symlink above).
MARKETPLACE="$HOME/.agents/plugins/marketplace.json"
TEMPLATE="$REPO/.agents/plugins/marketplace.json"
if [ ! -f "$MARKETPLACE" ]; then
  if [ -f "$TEMPLATE" ]; then
    echo "  installing personal marketplace from repo template: $MARKETPLACE"
    cp "$TEMPLATE" "$MARKETPLACE"
  else
    echo "  writing personal marketplace (template missing): $MARKETPLACE"
    cat > "$MARKETPLACE" <<'JSON'
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "oh-skills",
      "source": {
        "source": "local",
        "path": "./plugins/oh-skills"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_USE"
      },
      "category": "Productivity"
    }
  ]
}
JSON
  fi
else
  echo "  marketplace exists — skipping write: $MARKETPLACE"
fi

# ---------------------------------------------------------------------------
# Step 4: Register with Codex CLI if available
# ---------------------------------------------------------------------------
if command -v codex > /dev/null 2>&1; then
  echo "  codex CLI found — running cachebuster and registering plugin"
  CACHEBUSTER="$HOME/.codex/skills/.system/plugin-creator/scripts/update_plugin_cachebuster.py"
  if [ -f "$CACHEBUSTER" ]; then
    python3 "$CACHEBUSTER" "$REPO"
    echo "  cachebuster updated"
  else
    echo "  cachebuster script not found at $CACHEBUSTER — skipping"
  fi
  codex plugin add oh-skills@personal
  echo "  registered: oh-skills@personal"
else
  echo ""
  echo "  codex CLI not found. Manual next steps:"
  echo "    1. Install Codex CLI: https://platform.openai.com/docs/codex"
  echo "    2. Re-run this script, or run manually:"
  echo "         codex plugin add oh-skills@personal"
  echo "    3. Start a NEW Codex thread — skills are loaded at thread init,"
  echo "       not mid-session."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "oh-skills installed for OpenAI Codex."
echo "  ~/.oh-skills    -> $REPO  (shim anchor)"
echo "  ~/plugins/oh-skills -> $REPO  (marketplace path)"
echo "  marketplace: $MARKETPLACE"
echo ""
echo "Start a NEW Codex thread to pick up the skills."
