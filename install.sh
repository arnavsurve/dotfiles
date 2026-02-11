#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

# source -> target
declare -A LINKS=(
    ["$DOTFILES_DIR/zsh/.zshrc"]="$HOME/.zshrc"
    ["$DOTFILES_DIR/tmux/.tmux.conf"]="$HOME/.tmux.conf"
    ["$DOTFILES_DIR/git/.gitconfig"]="$HOME/.gitconfig"
    ["$DOTFILES_DIR/nvim"]="$HOME/.config/nvim"
    ["$DOTFILES_DIR/ghostty"]="$HOME/.config/ghostty"
)

mkdir -p "$HOME/.config"

for src in "${!LINKS[@]}"; do
    target="${LINKS[$src]}"

    # Already correctly linked
    if [ -L "$target" ] && [ "$(readlink "$target")" = "$src" ]; then
        echo "ok: $target -> $src (already linked)"
        continue
    fi

    # Back up existing file/dir that isn't a symlink
    if [ -e "$target" ] && [ ! -L "$target" ]; then
        mv "$target" "${target}.bak"
        echo "backed up: $target -> ${target}.bak"
    elif [ -L "$target" ]; then
        rm "$target"
        echo "removed stale symlink: $target"
    fi

    ln -s "$src" "$target"
    echo "linked: $target -> $src"
done
