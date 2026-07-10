#!/usr/bin/env bash
# cleanup.sh — safely tear down ONE git worktree and its Docker footprint.
#
# Removes the worktree (default: the one you're in) after verifying it has no
# uncommitted work, brings down only THAT worktree's own compose stacks +
# volumes, and sweeps disposable test cruft (testcontainers + dead containers).
#
# Safety rails:
#   - refuses protected branches (main/master/anyone/staging/production)
#   - refuses a dirty worktree unless --force
#   - only tears down compose projects whose working_dir is INSIDE the worktree
#     AND whose name does not contain "global" — shared/global stacks and other
#     worktrees' stacks are never touched
#   - keeps the local branch unless --delete-branch (and even then only if no
#     open PR and the branch is fully merged)
set -euo pipefail

FORCE=0
DELETE_BRANCH=0
KEEP_VOLUMES=0
KEEP_TEST_CRUFT=0
DRY_RUN=0
WT_ARG=""

usage() {
  cat <<'EOF'
Usage: cleanup.sh [worktree-path] [options]

  worktree-path       Worktree to remove (default: current worktree)

Options:
  --force             Remove even with uncommitted/untracked changes (discards them)
  --delete-branch     Also delete the local branch (only if no open PR and merged)
  --keep-volumes      Don't delete the torn-down worktree's compose volumes
  --keep-test-cruft   Don't sweep testcontainers / dead containers
  --dry-run           Print the plan, change nothing
  -h, --help          This help

Run it from OUTSIDE the target worktree, or your shell will be left in a
deleted directory.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --delete-branch) DELETE_BRANCH=1 ;;
    --keep-volumes) KEEP_VOLUMES=1 ;;
    --keep-test-cruft) KEEP_TEST_CRUFT=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown option: $1" >&2; usage; exit 2 ;;
    *) WT_ARG="$1" ;;
  esac
  shift
done

PROTECTED_BRANCHES="main master anyone staging production"
have_docker=0
command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && have_docker=1

# --- resolve the worktree -------------------------------------------------
if [ -n "$WT_ARG" ]; then
  WORKTREE="$(cd "$WT_ARG" 2>/dev/null && pwd)" || { echo "no such directory: $WT_ARG" >&2; exit 1; }
else
  WORKTREE="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    echo "not inside a git worktree — pass a worktree path" >&2; exit 1; }
fi
git -C "$WORKTREE" rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "$WORKTREE is not a git worktree" >&2; exit 1; }

BRANCH="$(git -C "$WORKTREE" rev-parse --abbrev-ref HEAD 2>/dev/null || echo DETACHED)"
COMMON_DIR="$(git -C "$WORKTREE" rev-parse --path-format=absolute --git-common-dir)"
# A sibling worktree to run `git worktree remove` from (can't remove from within).
OTHER_WT="$(git -C "$WORKTREE" worktree list --porcelain \
  | awk '/^worktree /{print $2}' | grep -vx "$WORKTREE" | head -1 || true)"

for p in $PROTECTED_BRANCHES; do
  [ "$BRANCH" = "$p" ] && { echo "refusing to clean protected branch '$BRANCH'" >&2; exit 1; }
done

# --- inspect state --------------------------------------------------------
DIRTY="$(git -C "$WORKTREE" status --porcelain)"
UPSTREAM="$(git -C "$WORKTREE" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
UNPUSHED=""
[ -n "$UPSTREAM" ] && UNPUSHED="$(git -C "$WORKTREE" log --oneline "$UPSTREAM"..HEAD 2>/dev/null || true)"

PR_STATE=""
if command -v gh >/dev/null 2>&1; then
  PR_STATE="$(gh -R "$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || echo)" \
     pr view "$BRANCH" --json state --jq '.state' 2>/dev/null || true)"
fi
# Only a truly OPEN PR should block deletion — `gh pr view` succeeds for
# merged/closed PRs too, and treating those the same as open ones means
# --delete-branch can never fire once a branch has ever had a PR merged.
HAS_OPEN_PR=0
[ "$PR_STATE" = "OPEN" ] && HAS_OPEN_PR=1

# Compose projects to tear down: working_dir under the worktree, name !~ global.
PROJECTS=""
if [ "$have_docker" = 1 ]; then
  PROJECTS="$(docker ps -a \
    --format '{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.project.working_dir"}}' 2>/dev/null \
    | awk -F'|' -v wt="$WORKTREE/" '$1!="" && index($2"/", wt)==1 && $1 !~ /global/ {print $1}' \
    | sort -u || true)"
fi

# --- plan -----------------------------------------------------------------
echo "── cleanup plan ──"
echo "worktree : $WORKTREE"
echo "branch   : $BRANCH${UPSTREAM:+  (upstream $UPSTREAM)}"
echo "clean    : $([ -z "$DIRTY" ] && echo yes || echo "NO — $(echo "$DIRTY" | grep -c .) changed file(s)")"
[ -n "$UNPUSHED" ] && echo "unpushed : $(echo "$UNPUSHED" | grep -c .) commit(s) (kept on the branch ref)"
[ -z "$UPSTREAM" ] && echo "unpushed : branch was never pushed (commits kept on the branch ref)"
echo "open PR  : $([ "$HAS_OPEN_PR" = 1 ] && echo yes || echo "no${PR_STATE:+ ($PR_STATE)}")"
if [ "$have_docker" = 1 ]; then
  echo "stacks   : ${PROJECTS:-(none for this worktree)}"
  [ "$KEEP_TEST_CRUFT" != 1 ] && echo "cruft    : $(docker ps -aq --filter 'label=org.testcontainers' | grep -c . || echo 0) testcontainers, $(docker ps -aq --filter 'status=dead' | grep -c . || echo 0) dead"
else
  echo "docker   : not available — skipping container cleanup"
fi
echo "branch   : $([ "$DELETE_BRANCH" = 1 ] && echo "delete (if no open PR & merged)" || echo "keep")"
echo "──────────────────"

if [ -n "$DIRTY" ] && [ "$FORCE" != 1 ]; then
  echo "ABORT: worktree has uncommitted changes. Commit/stash them, or pass --force to discard." >&2
  exit 1
fi
if [ "$DRY_RUN" = 1 ]; then echo "(dry-run — nothing changed)"; exit 0; fi

# --- tear down this worktree's compose stacks (before removing the dir) ----
if [ "$have_docker" = 1 ] && [ -n "$PROJECTS" ]; then
  while IFS= read -r proj; do
    [ -n "$proj" ] || continue
    echo "stopping compose project: $proj"
    cids="$(docker ps -aq --filter "label=com.docker.compose.project=$proj" || true)"
    [ -n "$cids" ] && docker rm -f $cids >/dev/null 2>&1 || true
    if [ "$KEEP_VOLUMES" != 1 ]; then
      vols="$(docker volume ls -q --filter "label=com.docker.compose.project=$proj" || true)"
      [ -n "$vols" ] && docker volume rm $vols >/dev/null 2>&1 || true
    fi
    nets="$(docker network ls -q --filter "label=com.docker.compose.project=$proj" || true)"
    [ -n "$nets" ] && docker network rm $nets >/dev/null 2>&1 || true
  done <<EOF
$PROJECTS
EOF
fi

# --- remove the worktree --------------------------------------------------
cd "${OTHER_WT:-$HOME}"
if [ "$FORCE" = 1 ]; then
  git -C "${OTHER_WT:-$COMMON_DIR}" worktree remove --force "$WORKTREE"
else
  git -C "${OTHER_WT:-$COMMON_DIR}" worktree remove "$WORKTREE"
fi
git -C "${OTHER_WT:-$COMMON_DIR}" worktree prune
echo "removed worktree: $WORKTREE"

# --- optionally delete the local branch -----------------------------------
if [ "$DELETE_BRANCH" = 1 ]; then
  if [ "$HAS_OPEN_PR" = 1 ]; then
    echo "keeping branch '$BRANCH' — it has an open PR"
  elif git -C "${OTHER_WT:-$COMMON_DIR}" branch -d "$BRANCH" 2>/dev/null; then
    echo "deleted branch: $BRANCH"
  else
    echo "kept branch '$BRANCH' — not fully merged (use 'git branch -D $BRANCH' to force)"
  fi
fi

# --- sweep disposable test cruft ------------------------------------------
if [ "$have_docker" = 1 ] && [ "$KEEP_TEST_CRUFT" != 1 ]; then
  tc="$(docker ps -aq --filter 'label=org.testcontainers' || true)"
  if [ -n "$tc" ]; then
    n=$(echo "$tc" | grep -c .)
    echo "$tc" | xargs -r docker rm -f >/dev/null 2>&1 || true
    echo "removed $n testcontainers leftover(s)"
  fi
  dead="$(docker ps -aq --filter 'status=dead' || true)"
  if [ -n "$dead" ]; then
    echo "$dead" | xargs -r docker rm -f >/dev/null 2>&1 || true
    still="$(docker ps -aq --filter 'status=dead' | grep -c . || echo 0)"
    [ "$still" -gt 0 ] && echo "note: $still container(s) stuck in Docker 'Dead' state — restart Docker Desktop to clear them"
  fi
fi

echo "done."
