# Global Instructions

## Dotfiles

`~/dotfiles/` is the single source of truth for all configuration. Every config file on disk should be a symlink back to this repo. `install.sh` manages all symlinks.

Rules:
- Never edit config files in their installed location (e.g. `~/.gitconfig`, `~/.pi/agent/settings.json`). Edit the source in `~/dotfiles/` — the symlink makes it live immediately.
- When adding a new config file to dotfiles, add a corresponding symlink entry in `install.sh` and run it to verify.
- If you find a config file that's a regular file instead of a symlink, that's a bug. Back up the file, reconcile any drift with the dotfiles version, then replace it with a symlink.
- Pi extensions and Claude skills are linked individually (not as a whole directory) so non-dotfiles items can coexist alongside them.
- iTerm2 plist is symlinked from `~/Library/Preferences/`. iTerm may overwrite symlinks on quit — if this happens, re-run `install.sh`.

## Polling & Monitoring

When monitoring long-running processes with `streamsh`, wait 5-10 seconds between status checks. Don't rapid-fire poll.

## Worktrees

When asked to spin off new work or work in a new worktree:
- The repo at ~/dev/escher/ is a bare checkout with worktrees as directories inside it
- Branch names must use a prefix like `feature/`, `fix/`, `chore/`, `hotfix/`, `experiment/`, etc.
    - Optionally, include a topic like `feature/coworker/branch-name`
- The worktree directory name must match the branch name exactly, so directories nest naturally under their prefix
- Create worktrees with: `git -C ~/dev/escher worktree add <branch-name> -b <branch-name>`
- Example: `git -C ~/dev/escher worktree add feature/my-thing -b feature/my-thing` → creates `~/dev/escher/feature/my-thing/`
- Never use a flat/shortened name that differs from the branch (e.g. don't use `my-thing` when the branch is `feature/my-thing`)
- Then cd into ~/dev/escher/<branch-name>/ to do the work

## Code Style

### Comments

- Don't use numbered comments (e.g. `// 1. Do X`, `// Step 2: ...`, `// --- Section Name ---`)
- Don't write comments that restate what the code already says
- Only comment non-obvious logic: subtle invariants, unintuitive workarounds, "why" not "what"
- No section-header comments unless the file is genuinely long and complex
