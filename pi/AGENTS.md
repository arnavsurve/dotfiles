# Pi Agent Instructions

## Pi Configuration

Pi config lives in `~/dotfiles/pi/` and is symlinked into `~/.pi/agent/`. Tracked files:

- `AGENTS.md` — global agent instructions
- `settings.json` — preferences, default model, packages
- `models.json` — model/provider overrides
- `mcp.json` — MCP server configuration
- `agents/` — subagent definitions (scout, planner, worker, reviewer)
- `prompts/` — slash command prompt templates
- `themes/` — custom themes
- `extensions/` — pi extensions (single files or subdirectories with `index.ts`)

Not tracked (generated/sensitive): `auth.json`, `mcp-cache.json`, `sessions/`, `bin/`

## Pi Extensions

Extensions live in `~/dotfiles/pi/extensions/` and are symlinked into `~/.pi/agent/extensions/`.

- There's a single shared `package.json` across all extensions at the extensions root for IDE type resolution
- New extensions go in `~/dotfiles/pi/extensions/` (single file or subdirectory with `index.ts`)
- After adding one, symlink it: `ln -s /Users/asurve/dotfiles/pi/extensions/<name> ~/.pi/agent/extensions/<name>`
- If you add a new dependency, run `npm install` in `~/dotfiles/pi/extensions/`
- The `package.json` and `node_modules` are also symlinked into `~/.pi/agent/extensions/`

## Clipboard

When generating text intended for use outside this session — prompts for other agents, commands to paste elsewhere, etc. — pipe it directly to the clipboard via `echo "..." | pbcopy` instead of printing it. Newlines in pasted text get interpreted as Enter in pi, so single-line output is preferred when possible.
