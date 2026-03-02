# Global Instructions

## Polling & Monitoring

When monitoring long-running processes with `streamsh`, wait 5-10 seconds between status checks. Don't rapid-fire poll.

## Worktrees

When asked to spin off new work or work in a new worktree:
- The repo at ~/dev/escher/ is a bare checkout with worktrees as directories inside it
- Create worktrees with: `git -C ~/dev/escher worktree add <name> -b <branch-name>`
- Then cd into ~/dev/escher/<name>/ to do the work
