#!/usr/bin/env bash
# wt-prs.sh — discover worktrees in an escher bare checkout, correlate each with
# its GitHub PR, and classify by PR state: merged/closed = cleanup candidates,
# open/none/protected = keep.
#
# READ-ONLY. It removes nothing. It prints a plan and the exact cleanup.sh
# commands to run; a human/agent reviews, handles dirty trees, then executes.
#
# Needs: gh (authed), jq, git.  Usage: wt-prs.sh [--base DIR] [--no-cmds]
set -uo pipefail   # deliberately NOT -e: a per-branch gh miss must not abort the sweep

BASE="$HOME/dev/escher"
EMIT_CMDS=1
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="${2:?--base needs a dir}"; shift 2 ;;
    --no-cmds) EMIT_CMDS=0; shift ;;
    -h|--help) echo "usage: wt-prs.sh [--base DIR] [--no-cmds]"; exit 0 ;;
    *) BASE="$1"; shift ;;   # bare positional = base dir
  esac
done

command -v gh >/dev/null 2>&1 || { echo "wt-prs: need gh on PATH" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "wt-prs: need jq on PATH" >&2; exit 1; }
[ -d "$BASE" ] || { echo "wt-prs: no such base dir: $BASE" >&2; exit 1; }

# cleanup.sh from the sibling `cleanup` skill does the actual safe teardown
CLEANUP_SH="$HOME/.agents/skills/cleanup/scripts/cleanup.sh"
# never offer these as candidates regardless of PR state
PROTECTED_RE='^(main|master|anyone|staging|production)$'

slug="$(git -C "$BASE" remote get-url origin 2>/dev/null \
  | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')"
[ -n "$slug" ] || { echo "wt-prs: can't resolve github slug from $BASE origin" >&2; exit 1; }

# One bulk fetch of my PRs keyed by head branch — the latest PR per branch wins
# (a branch can carry several PRs after a reopen/retarget). Per-branch gh calls
# are the slow fallback, only for branches this set doesn't cover.
mine="$(gh pr list -R "$slug" --author @me --state all --limit 500 \
  --json number,headRefName,state,url 2>/dev/null \
  | jq 'group_by(.headRefName) | map(max_by(.number)) | INDEX(.headRefName)')"
[ -n "$mine" ] || mine='{}'

tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
# columns: state \t dirty \t dir \t pr# \t who \t url \t branch \t path
while IFS=$'\t' read -r path branch; do
  [ -n "${branch:-}" ] || continue
  [ "$branch" = "(detached)" ] && continue

  if [ -d "$path" ]; then
    dir=present
    n="$(git -C "$path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
    [ "$n" = 0 ] && dirty=clean || dirty="dirty:$n"
  else
    dir=gone; dirty=-          # stale registration: dir already vanished
  fi

  if echo "$branch" | grep -qE "$PROTECTED_RE"; then
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' PROTECTED "$dirty" "$dir" - - - "$branch" "$path" >> "$tmp"
    continue
  fi

  # my PRs first, then fall back to any author (catches shared / someone-else's branches)
  pr="$(echo "$mine" | jq -r --arg b "$branch" '.[$b] // empty | "\(.number)\t\(.state)\t\(.url)\tme"')"
  if [ -z "$pr" ]; then
    pr="$(gh pr list -R "$slug" --head "$branch" --state all --limit 20 \
      --json number,state,url,author 2>/dev/null \
      | jq -r 'if length==0 then empty else (max_by(.number) | "\(.number)\t\(.state)\t\(.url)\t\(.author.login)") end')"
  fi

  if [ -n "$pr" ]; then
    prnum="$(printf '%s' "$pr" | cut -f1)"; state="$(printf '%s' "$pr" | cut -f2)"
    url="$(printf '%s' "$pr" | cut -f3)";   who="$(printf '%s' "$pr" | cut -f4)"
  else
    prnum=-; state=NO_PR; url=-; who=-
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$state" "$dirty" "$dir" "$prnum" "$who" "$url" "$branch" "$path" >> "$tmp"
done < <(git -C "$BASE" worktree list --porcelain \
  | awk '/^worktree /{wt=$2} /^branch /{sub("refs/heads/","",$2); print wt"\t"$2}')

print_group() {   # $1 = state regex
  local re="$1" any=0
  while IFS=$'\t' read -r state dirty dir pr who url branch path; do
    [ -n "${state:-}" ] || continue
    echo "$state" | grep -qE "$re" || continue
    any=1
    printf '  %-7s %-9s %-7s %-7s %-13s %s\n' \
      "$state" "$dirty" "$dir" "${pr:+#$pr}" "$who" "$branch"
  done < "$tmp"
  [ "$any" = 1 ] || echo "  (none)"
}

echo "repo: $slug    base: $BASE"
echo
echo "── CLEANUP CANDIDATES (merged / closed PRs) ──"
printf '  %-7s %-9s %-7s %-7s %-13s %s\n' STATE DIRTY DIR PR WHO BRANCH
print_group '^(MERGED|CLOSED)$'
echo
echo "── KEEP (open / no PR / protected) ──"
print_group '^(OPEN|NO_PR|PROTECTED)$'

if [ "$EMIT_CMDS" = 1 ]; then
  echo
  echo "# Run sequentially from ~/dev/escher/main (worktree ops share .bare metadata — never parallel)."
  echo "# Clean candidates are ready to run; DIRTY ones need a diff check first; stale entries just prune."
  while IFS=$'\t' read -r state dirty dir pr who url branch path; do
    echo "${state:-}" | grep -qE '^(MERGED|CLOSED)$' || continue
    if [ "$dir" = gone ]; then
      echo "#   STALE  $branch — dir gone; entry usually already pruned. If listed: git -C \"$BASE\" worktree prune"
    elif [ "$dirty" = clean ]; then
      echo "$CLEANUP_SH $path"
    else
      echo "#   DIRTY  $branch ($dirty) — inspect 'git -C $path status --short' + diff; if only tooling noise: $CLEANUP_SH $path --force"
    fi
  done < "$tmp"
fi
