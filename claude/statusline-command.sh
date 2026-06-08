#!/bin/sh
# Claude Code status line — mirrors the nara zsh theme prompt.
# Receives JSON on stdin; uses jq to extract cwd and model info.

input=$(cat)
cwd=$(echo "$input" | jq -r '.cwd // .workspace.current_dir // ""')
model=$(echo "$input" | jq -r '.model.display_name // ""')

# Abbreviate home directory to ~
case "$cwd" in
  "$HOME"*) short_dir="~${cwd#$HOME}" ;;
  *) short_dir="$cwd" ;;
esac

# Git branch (skip locks to avoid contention with running git ops)
branch=""
if git -C "$cwd" rev-parse --git-dir >/dev/null 2>&1; then
  branch=$(git -C "$cwd" -c core.checkStat=minimal symbolic-ref --short HEAD 2>/dev/null \
           || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
fi

# Context window remaining
remaining=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')

# Build the line
# Colors: white for ॐ, cyan for path, blue for branch, dim for model/ctx
if [ -n "$branch" ]; then
  printf '\033[37mॐ\033[0m  \033[36m%s\033[0m  \033[34m %s\033[0m' "$short_dir" "$branch"
else
  printf '\033[37mॐ\033[0m  \033[36m%s\033[0m' "$short_dir"
fi

if [ -n "$model" ]; then
  printf '  \033[2m%s\033[0m' "$model"
fi

if [ -n "$remaining" ]; then
  printf '  \033[2mctx: %s%%\033[0m' "$(printf '%.0f' "$remaining")"
fi

printf '\n'

# Session id on a second line — select & paste to resume this thread elsewhere
session_id=$(echo "$input" | jq -r '.session_id // empty')
if [ -n "$session_id" ]; then
  printf '\033[2m%s\033[0m\n' "$session_id"
fi
