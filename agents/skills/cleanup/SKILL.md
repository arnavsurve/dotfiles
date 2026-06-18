---
name: cleanup
description: |
  Safely tear down a finished git worktree and its Docker footprint in the
  escher bare-checkout setup (~/dev/escher with worktrees as nested dirs).
  Removes the worktree only if it has no uncommitted work, brings down just
  that worktree's own compose stacks + volumes, and sweeps disposable test
  cruft — without touching other worktrees' stacks or shared/global stacks.
  Use when done with a worktree (PR merged or abandoned) and asked to "clean
  up the worktree", "clean up docker", or both.
allowed-tools:
  - Bash
  - Read
---

# cleanup

Tear down a finished worktree and its Docker footprint. The danger here is
collateral damage — this machine usually runs many worktree dev stacks at
once, plus shared `*-global-*` stacks (clickhouse, nango, portkey, verdaccio)
and `testcontainers` leftovers. Only the target worktree's own resources may
be removed.

## Use the script

`scripts/cleanup.sh` does the safe mechanical work. Run it from OUTSIDE the
target worktree (it cd's out, but your calling shell shouldn't sit in a dir
that's about to vanish).

```bash
# preview — always do this first
~/.agents/skills/cleanup/scripts/cleanup.sh ~/dev/escher/fix/anyone/my-topic --dry-run

# do it
~/.agents/skills/cleanup/scripts/cleanup.sh ~/dev/escher/fix/anyone/my-topic
```

No path = the current worktree. Flags: `--force` (discard uncommitted
changes), `--delete-branch` (only if no open PR and merged), `--keep-volumes`,
`--keep-test-cruft`, `--dry-run`.

What it does, in order: prints a plan; aborts if the worktree is dirty (unless
`--force`); brings down compose projects whose `working_dir` is inside the
worktree and whose name lacks `global`; `git worktree remove` + prune; sweeps
`testcontainers` + `dead` containers.

## Safety model (why it's shaped this way)

- **Worktree:** refuses protected branches (`main`/`master`/`anyone`/`staging`/
  `production`) and a dirty tree (unless `--force`). Removing a worktree keeps
  the local branch ref, so unpushed commits are not lost — it only warns.
- **Compose stacks:** a worktree's dev stack is labelled
  `com.docker.compose.project.working_dir=<worktree>/apps/anyone`. Tear down
  only projects matching that prefix. Exclude any project whose name contains
  `global` — those (`anyone-global-clickhouse`, etc.) are shared across all
  worktrees and their `working_dir` happens to point at whichever worktree
  started them first; tearing one down breaks every other worktree.
- **Volumes:** removed by default (the worktree is going away, so its DB data
  is moot, and stale stacks fill the disk). `--keep-volumes` to preserve.
- **Test cruft:** `testcontainers` (`label=org.testcontainers`) and `dead`
  containers are disposable infra, safe to remove globally. Containers stuck
  in Docker's "Dead" state often can't be reaped by `docker rm -f`; that needs
  a Docker Desktop restart, which this skill never does on its own (it would
  bounce every running stack).

## Before running

If the worktree has a live `yarn anyone` stack (dev servers + cloudflared
tunnels, not just containers), run `yarn anyone stop` inside it first to kill
the non-Docker processes — the script only handles containers/volumes.

## Manual fallback

```bash
# 1. confirm clean + pushed
git -C <wt> status --porcelain      # empty = clean
# 2. this worktree's NON-global stacks only
docker ps -a --format '{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.project.working_dir"}}' \
  | awk -F'|' -v wt="<wt>/" '$1!="" && index($2"/",wt)==1 && $1 !~ /global/ {print $1}' | sort -u
docker rm -f $(docker ps -aq --filter label=com.docker.compose.project=<proj>)
# 3. remove the worktree (run from a sibling worktree)
git worktree remove <wt> && git worktree prune
# 4. disposable cruft
docker rm -f $(docker ps -aq --filter label=org.testcontainers)
```
