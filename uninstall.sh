#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

declare -A LINKS=(
    ["$DOTFILES_DIR/zsh/.zshrc"]="$HOME/.zshrc"
    ["$DOTFILES_DIR/tmux/.tmux.conf"]="$HOME/.tmux.conf"
    ["$DOTFILES_DIR/git/.gitconfig"]="$HOME/.gitconfig"
    ["$DOTFILES_DIR/nvim"]="$HOME/.config/nvim"
    ["$DOTFILES_DIR/ghostty"]="$HOME/.config/ghostty"
)

for src in "${!LINKS[@]}"; do
    target="${LINKS[$src]}"

    # Only remove if it's a symlink pointing into this dotfiles repo
    if [ -L "$target" ] && [ "$(readlink "$target")" = "$src" ]; then
        rm "$target"
        echo "removed symlink: $target"

        # Restore backup if it exists
        if [ -e "${target}.bak" ]; then
            mv "${target}.bak" "$target"
            echo "restored: ${target}.bak -> $target"
        fi
    else
        echo "skipped: $target (not a symlink to this repo)"
    fi
done
