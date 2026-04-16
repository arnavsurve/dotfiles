#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

declare -A LINKS=(
    ["$DOTFILES_DIR/zsh/.zshrc"]="$HOME/.zshrc"
    ["$DOTFILES_DIR/tmux/.tmux.conf"]="$HOME/.tmux.conf"
    ["$DOTFILES_DIR/git/.gitconfig"]="$HOME/.gitconfig"
    ["$DOTFILES_DIR/nvim"]="$HOME/.config/nvim"
    ["$DOTFILES_DIR/ghostty"]="$HOME/.config/ghostty"
    ["$DOTFILES_DIR/claude/settings.json"]="$HOME/.claude/settings.json"
    ["$DOTFILES_DIR/claude/settings.local.json"]="$HOME/.claude/settings.local.json"
    ["$DOTFILES_DIR/lazygit/config.yml"]="$HOME/.config/lazygit/config.yml"
)

remove_link() {
    local src="$1" target="$2"

    if [ -L "$target" ] && [ "$(readlink "$target")" = "$src" ]; then
        rm "$target"
        echo "removed symlink: $target"

        if [ -e "${target}.bak" ]; then
            mv "${target}.bak" "$target"
            echo "restored: ${target}.bak -> $target"
        fi
    else
        echo "skipped: $target (not a symlink to this repo)"
    fi
}

for src in "${!LINKS[@]}"; do
    target="${LINKS[$src]}"
    remove_link "$src" "$target"
done

for skill in "$DOTFILES_DIR/agents/skills"/*/; do
    [ -d "$skill" ] || continue
    remove_link "$skill" "$HOME/.agents/skills/$(basename "$skill")"
    remove_link "$skill" "$HOME/.claude/skills/$(basename "$skill")"
done
