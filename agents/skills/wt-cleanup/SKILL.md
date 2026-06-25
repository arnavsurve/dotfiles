---
name: wt-cleanup
description: |
  Bulk-clean finished worktrees in the escher bare checkout (~/dev/escher),
  driven by GitHub PR state. Goes through every worktree, correlates each with
  its PR, lists the ones whose PRs are merged or closed, and tears those down
  safely by delegating to the per-worktree `cleanup` skill. Use when asked to
  "go through my worktrees and check their PRs", "list worktrees whose PRs are
  merged/closed", or "clean up all the merged/closed worktrees" at once.
allowed-tools:
  - Bash
  - Read
---

# wt-cleanup

Sweep many worktrees at once, keyed by PR state. This is the discovery +
correlation + orchestration layer; the actual per-worktree teardown is the
sibling **`cleanup`** skill (`~/.agents/skills/cleanup/scripts/cleanup.sh`),
which already knows how to spare shared `*-global-*` Docker stacks. Do not
re-implement teardown here — delegate to it, one worktree at a time.

## Step 1 — report (read-only)

`scripts/wt-prs.sh` lists every worktree, correlates each with its latest PR,
and classifies them. It removes nothing.

```bash
~/.agents/skills/wt-cleanup/scripts/wt-prs.sh            # default base ~/dev/escher
~/.agents/skills/wt-cleanup/scripts/wt-prs.sh --no-cmds  # table only, no command suggestions
```

It prints a candidates table (MERGED/CLOSED), a keep table (OPEN/NO_PR/
PROTECTED), per-row `dirty`/`dir` flags, and ready-to-run `cleanup.sh` lines.
How it correlates: one bulk `gh pr list --author @me --state all` keyed by head
branch (latest PR per branch wins — branches can carry several after a reopen/
retarget), then a per-branch `gh pr list --head` fallback for branches you
don't own (shared/integration branches, someone else's checkout).

If the user only wanted the list, stop here and show the table.

## Step 2 — judge the dirty candidates

Never `--force` blind. For each candidate flagged `dirty:N`, read the actual
change before discarding it:

```bash
git -C <wt> status --short
git -C <wt> diff HEAD -- <file>
```

Disposable tooling noise — safe to `--force` past: lockfile churn
(`package-lock.json`, `yarn.lock`), `.yarn/cache/*.zip` add/delete,
`package.json` key reordering or formatting, build artifacts (`dist/`,
`.next/`, `node_modules/`). Real source edits (`.ts`/`.tsx`/`.py`/etc. with
semantic changes): stop and surface them to the user — stash or commit, don't
discard. In practice merged-PR worktrees accumulate only noise, but verify.

## Step 3 — execute sequentially

Run every removal **from `~/dev/escher/main`** (a non-target worktree), one at
a time. `git worktree remove`/`prune` all mutate the shared `.bare/worktrees`
metadata — running them in parallel can corrupt it. A batch loop is fine, but
keep it serial:

```bash
# clean candidates
~/.agents/skills/cleanup/scripts/cleanup.sh ~/dev/escher/<branch>
# dirty-but-noise candidates (after the Step 2 check)
~/.agents/skills/cleanup/scripts/cleanup.sh ~/dev/escher/<branch> --force
```

`cleanup.sh` keeps the local branch ref by default, so removing a worktree
never loses commits — only the working dir goes away.

## Step 4 — stale entries & someone-else's branches

- **Already-gone dirs** (`dir gone` in the report): the worktree was removed
  out from under you (worktrees vanish concurrently — re-baseline against a
  fresh `git worktree list` if a run spans a while). Its registration is
  usually already swept (`cleanup.sh` prunes after each remove). If an entry
  lingers, `git -C ~/dev/escher worktree prune`.
- **Do not blanket `git worktree prune --expire=now`.** Default prune has a
  ~3-month grace (`gc.worktreePruneExpire`), which protects unrelated prunable
  entries — e.g. someone else's open-PR worktree whose dir happens to be gone.
  Their branch refs survive a prune anyway, but be deliberate: remove a single
  stale entry surgically with `git worktree remove --force <path>` (it errors
  "is not a working tree" if the entry's already gone, which means you're done).
- **Branch deletion is opt-in and separate.** `cleanup.sh` keeps branches.
  Delete a branch ref only when explicitly asked, or when it's clearly
  disposable (closed PR **and** not yours). After a merged-worktree sweep,
  offer to bulk-delete the merged branch refs rather than doing it unprompted.

## Step 5 — verify

```bash
git -C ~/dev/escher worktree list                       # candidates gone, keepers (incl. protected/others') intact
docker ps --format '{{.Names}}\t{{.Status}}' | grep -iE 'clickhouse|nango|portkey|verdaccio'   # shared stacks still up
```

A removed worktree may have been the `working_dir` anchor for a shared
`*-global-*` stack (e.g. clickhouse). The stack keeps running with a now-stale
anchor — that's expected and harmless; `cleanup.sh` never tears it down.

Finally, surface the recurring **"N containers stuck in Docker 'Dead' state"**
note: those need a Docker Desktop restart to clear, which neither skill does on
its own (it would bounce every running stack).
