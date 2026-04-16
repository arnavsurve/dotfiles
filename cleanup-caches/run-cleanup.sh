#!/bin/bash
# Nightly cleanup of caches and stale Docker artifacts.
# Invoked by com.asurve.cleanup-caches launchd agent at 5am daily.

set -uo pipefail

DAYS=7
SCAN_ROOT="$HOME/dev"

# fnm provides node/npm/yarn on PATH
if command -v fnm &>/dev/null; then
  eval "$(fnm env --use-on-cd)" 2>/dev/null || true
fi

echo "$(date): Starting cache cleanup (files older than ${DAYS} days)"

echo ""
echo "=== .turbo caches ==="
if [ -d "$SCAN_ROOT" ]; then
  find "$SCAN_ROOT" -type d \( -name node_modules -prune -o -name .git -prune -o -name '.turbo' -prune -print \) 2>/dev/null | while read -r dir; do
    old_files=$(find "$dir" -type f -mtime +"$DAYS" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$old_files" -gt 0 ]; then
      size_before=$(du -sk "$dir" 2>/dev/null | cut -f1)
      find "$dir" -type f -mtime +"$DAYS" -delete 2>/dev/null
      find "$dir" -type d -empty -delete 2>/dev/null
      size_after=$(du -sk "$dir" 2>/dev/null | cut -f1 || echo 0)
      freed=$(( (size_before - size_after) / 1024 ))
      echo "  Cleaned $dir — freed ${freed}MB"
    fi
  done
else
  echo "  $SCAN_ROOT not found — skipping"
fi

echo ""
echo "=== Yarn cache ==="
if command -v yarn &>/dev/null; then
  size=$(du -sh ~/.yarn/cache 2>/dev/null | cut -f1 || echo "0")
  yarn cache clean 2>/dev/null && echo "  Cleaned yarn cache (was $size)" || true
fi

echo ""
echo "=== npm cache ==="
if command -v npm &>/dev/null; then
  size=$(du -sh ~/.npm 2>/dev/null | cut -f1 || echo "0")
  npm cache clean --force 2>/dev/null && echo "  Cleaned npm cache (was $size)" || true
fi

echo ""
echo "=== Homebrew cache ==="
if command -v brew &>/dev/null; then
  size=$(du -sh "$(brew --cache 2>/dev/null)" 2>/dev/null | cut -f1 || echo "0")
  brew cleanup --prune=7 2>/dev/null && echo "  Cleaned brew cache (was $size)" || true
fi

echo ""
echo "=== Docker ==="
if docker info &>/dev/null 2>&1; then
  docker system prune -a -f 2>/dev/null && echo "  Pruned stopped containers, unused images, networks, build cache" || true

  # Only anonymous dangling volumes (64-char hex). Named volumes are preserved
  # even when dangling, to survive compose down/up cycles.
  dangling_anon=$(docker volume ls -q -f dangling=true 2>/dev/null | grep -E '^[0-9a-f]{64}$' || true)
  if [ -n "$dangling_anon" ]; then
    count=$(echo "$dangling_anon" | wc -l | tr -d ' ')
    echo "$dangling_anon" | xargs docker volume rm >/dev/null 2>&1 || true
    echo "  Removed $count anonymous dangling volumes"
  else
    echo "  No anonymous dangling volumes to remove"
  fi
else
  echo "  Docker not running — skipping"
fi

echo ""
echo "$(date): Cleanup complete"
