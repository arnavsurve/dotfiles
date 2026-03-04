# Global Instructions

## Polling & Monitoring

When monitoring long-running processes with `streamsh`, wait 5-10 seconds between status checks. Don't rapid-fire poll.

## Worktrees

When asked to spin off new work or work in a new worktree:
- The repo at ~/dev/escher/ is a bare checkout with worktrees as directories inside it
- Branch names must use a prefix like `feature/`, `fix/`, `chore/`, `hotfix/`, `experiment/`, etc.
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
