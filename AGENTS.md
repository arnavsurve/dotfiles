# Global Instructions

## Polling & Monitoring

When monitoring long-running processes with `streamsh`, wait 5-10 seconds between status checks. Don't rapid-fire poll.

## Worktrees

When asked to spin off new work or work in a new worktree:
- The repo at ~/dev/escher/ is a bare checkout with worktrees as directories inside it
- Create worktrees with: `git -C ~/dev/escher worktree add <name> -b <branch-name>`
- Then cd into ~/dev/escher/<name>/ to do the work

## Code Style

### Comments

- Don't use numbered comments (e.g. `// 1. Do X`, `// Step 2: ...`, `// --- Section Name ---`)
- Don't write comments that restate what the code already says
- Only comment non-obvious logic: subtle invariants, unintuitive workarounds, "why" not "what"
- No section-header comments unless the file is genuinely long and complex
