# Global Instructions

## Dotfiles

`~/dotfiles/` is the single source of truth for all configuration. Every config file on disk should be a symlink back to this repo. `install.sh` manages all symlinks.

Rules:
- Never edit config files in their installed location (e.g. `~/.gitconfig`, `~/.pi/agent/settings.json`). Edit the source in `~/dotfiles/` — the symlink makes it live immediately.
- When adding a new config file to dotfiles, add a corresponding symlink entry in `install.sh` and run it to verify.
- If you find a config file that's a regular file instead of a symlink, that's a bug. Back up the file, reconcile any drift with the dotfiles version, then replace it with a symlink.
- Pi extensions and agent skills are linked individually. Skills from `~/dotfiles/agents/skills/` are symlinked into both `~/.agents/skills/` and `~/.claude/skills/` so non-dotfiles items can coexist alongside them.
- iTerm2 plist is symlinked from `~/Library/Preferences/`. iTerm may overwrite symlinks on quit — if this happens, re-run `install.sh`.

## Polling & Monitoring

When monitoring long-running processes with `streamsh`, wait 5-10 seconds between status checks. Don't rapid-fire poll.

## Portability

Dotfiles travel across machines (macOS daily driver, occasional Linux). When adding shell helpers, aliases, scripts, or config, default to platform/distro agnostic from the start — don't hardcode macOS-only paths or assume specific binaries unless the helper is genuinely macOS-only (e.g. anything touching `/Applications/` or `defaults`).

- For binaries that exist under different names across distros (e.g. `google-chrome` vs `chromium-browser`, `gsed` vs `sed`, `pbcopy` vs `xclip`), probe with `command -v` and fall back. Error loudly if nothing matches — don't silently no-op.
- Prefer XDG paths (`$HOME/.local/share`, `$HOME/.config`, `$HOME/.cache`) over macOS-only locations like `~/Library/...` for data the helper itself owns.
- Gate truly OS-specific blocks on `$OSTYPE` (`darwin*`, `linux*`) rather than assuming.
- If a helper genuinely can't be made portable, say so in a comment and exit cleanly on unsupported platforms instead of failing with a confusing error.

## Browser debugging (CDP)

The user's daily browser is Arc and is **not** launched with `--remote-debugging-port`, so `browser-harness` can't attach to it directly. To inspect/debug the user's browser state, ask them to launch a separate CDP-enabled Chromium via the `chrome-debug` shell function (defined in `~/dotfiles/zsh/.zshrc`):

- Runs Chrome on macOS, falls back to `google-chrome` / `chromium` / `chromium-browser` on Linux.
- Listens on port `9222` (the CDP default `browser-harness` expects).
- Uses an isolated `--user-data-dir` at `~/.local/share/chrome-debug-profile`, so it doesn't see the user's normal Chrome/Arc cookies, sessions, or extensions. The user has to log in to anything they want you to see.
- Accepts pass-through args: `chrome-debug https://example.com` opens a tab on launch.

## Worktrees

When asked to spin off new work or work in a new worktree:
- The repo at ~/dev/escher/ is a bare checkout with worktrees as directories inside it
- Branch names must use a prefix like `feature/`, `fix/`, `chore/`, `hotfix/`, `experiment/`, etc.
    - When working within a known project or area, include it as a topic: `feature/coworker/branch-name`, `fix/dotfiles/broken-symlink`
    - Only omit the topic for truly cross-cutting or standalone work
- The worktree directory name must match the branch name exactly, so directories nest naturally under their prefix
- Create worktrees with: `git -C ~/dev/escher worktree add <branch-name> -b <branch-name>`
- Example: `git -C ~/dev/escher worktree add feature/my-thing -b feature/my-thing` → creates `~/dev/escher/feature/my-thing/`
- Never use a flat/shortened name that differs from the branch (e.g. don't use `my-thing` when the branch is `feature/my-thing`)
- Then cd into ~/dev/escher/<branch-name>/ to do the work

### Nested feature groups with an integration branch

Some long-lived features have an integration branch that accumulates sub-feature work before merging up. By convention the local branch and worktree are named `feature/<group>/main`, but **the local branch tracks a remote branch that may have a different name**. For example, `feature/anyone/main` tracks `origin/anyone`.

When the current working directory is `~/dev/escher/feature/<group>/main/` or `~/dev/escher/feature/<group>/<topic>/` AND a `feature/<group>/main` branch exists:
- Find the remote upstream first: `git rev-parse --abbrev-ref feature/<group>/main@{upstream}` (e.g. `origin/anyone`)
- New work goes at `feature/<group>/<topic>`, branched off `origin/<upstream>` (not the local branch — it may have drifted, and may not even have an upstream configured)
- Command: `git -C ~/dev/escher worktree add feature/<group>/<topic> -b feature/<group>/<topic> origin/<upstream>`
- Example for the anyone group: `git -C ~/dev/escher worktree add feature/anyone/my-topic -b feature/anyone/my-topic origin/anyone`
- PRs from `feature/<group>/<topic>` target the **remote upstream branch** (e.g. `anyone` for the anyone group), not `main`
- Only break out of the group prefix if the work is genuinely unrelated to the group

This does NOT apply to prefix-grouped areas without an integration branch (e.g. `feature/coworker/*` topics all branch off `main` directly — there is no `feature/coworker/main`). Verify the integration branch exists before assuming this pattern.

## Git Commits

Pre-agreed multi-step task lists: when working through a task list the user has explicitly approved (e.g. a PR review punch list, plan-mode plan, /loop work), commit each task as a separate logical commit as it's completed. Don't batch — small commits keep the diff reviewable and let mid-flight rollback work. Still surface what you committed in the response so the user can redirect.

## Testing

Default to red/green TDD when writing code:
- Write a failing test first that captures the desired behavior
- Implement the minimum to make it pass
- Refactor only after green, never before

For bug fixes, the failing test is a regression test that reproduces the bug. Exceptions: config edits, docs, typo fixes, exploratory spikes (call out when spiking).

Tests must be real, not mock theater. A test where every collaborator is stubbed only re-checks wiring you wrote in the test — it can't catch a real bug, so it ships false confidence. The deciding line is ownership, not convenience:
- Double only boundaries you don't own: a third-party network SDK, the process edge (an external HTTP service, e2b, a Slack/email API), and auth/session. Use MSW for the HTTP edge — never stub `global.fetch`, and never `vi.mock`/`jest.mock` your own client/sibling module (mock the HTTP it makes instead).
- Use the real thing for everything you own or the harness provides: the DB, Redis, the job queue (assert the job actually landed), your own modules. Never mock the ORM (TypeORM/Drizzle). A partial `vi.mock('pkg', () => ({ ...actual, oneFn }))` is a targeted seam, not "mocking the module" — that's fine.
- Assert the observable outcome, not the mock. Even when a boundary double is legitimate, assert what crossed it — the bytes written, the real downstream row/job — never a hoisted recorder or `toHaveBeenCalledWith`. A call *count* is fair game only when the count IS the behavior (retry attempts, heartbeat cadence); never as a stand-in for an outcome you could observe directly.
- Too hard to test without mocking everything? That's a design signal — extract the pure logic and unit-test that, or write an integration test against real infra. Don't reach for more mocks.
- Before calling a test over-mocked (yours or in review), READ it — a diff skim misreads `...actual` seams and house-convention boundary doubles as over-mocking.

## Code Style

### Comments

- Don't use numbered comments (e.g. `// 1. Do X`, `// Step 2: ...`, `// --- Section Name ---`)
- Don't write comments that restate what the code already says
- Only comment non-obvious logic: subtle invariants, unintuitive workarounds, "why" not "what"
- No section-header comments unless the file is genuinely long and complex

### Markdown

- If instructed to edit a markdown document, maintain existing formatting patterns
    - For example, if told to modify a `todo.md` on the desktop - don't overwrite existing human written todos or headings. Just modify additively
    - For things like `PLAN.md`s in repos used for iteration and planning, this does not apply
@~/Developer/browser-harness/SKILL.md
