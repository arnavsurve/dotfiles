#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

# ---------------------------------------------------------------------------
# 1. Install system dependencies
# ---------------------------------------------------------------------------

install_deps_apt() {
    echo "==> Installing dependencies via apt..."

    # Wait for any other apt/dpkg process to finish (e.g. Coder startup script)
    while sudo fuser /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock /var/lib/dpkg/lock &>/dev/null 2>&1; do
        echo "waiting for apt lock..."
        sleep 3
    done

    sudo apt-get update -qq

    # Retry if dpkg lock is still held (startup script may grab it between commands)
    sudo apt-get -o DPkg::Lock::Timeout=60 install -y -qq \
        build-essential \
        curl \
        unzip \
        tar \
        gzip \
        git \
        zsh \
        fd-find \
        ripgrep \
        fzf \
        python3 \
        python3-pip \
        python3-venv

    # fd-find installs as fdfind on Ubuntu — symlink to fd
    if command -v fdfind &>/dev/null && ! command -v fd &>/dev/null; then
        sudo ln -sf "$(command -v fdfind)" /usr/local/bin/fd
        echo "ok: symlinked fdfind -> fd"
    fi

    # lazygit (not in default repos)
    if ! command -v lazygit &>/dev/null; then
        echo "==> Installing lazygit..."
        LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -Po '"tag_name": "v\K[^"]*')
        curl -Lo /tmp/lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz"
        tar xf /tmp/lazygit.tar.gz -C /tmp lazygit
        sudo install /tmp/lazygit /usr/local/bin
        rm -f /tmp/lazygit /tmp/lazygit.tar.gz
        echo "ok: lazygit $(lazygit --version | head -1)"
    else
        echo "ok: lazygit already installed"
    fi

    # Node.js via fnm (used in .zshrc)
    if ! command -v fnm &>/dev/null; then
        echo "==> Installing fnm..."
        curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
    fi
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$(fnm env)"
    if ! command -v node &>/dev/null; then
        echo "==> Installing Node.js LTS via fnm..."
        fnm install --lts
        fnm default lts-latest
    fi
    echo "ok: node $(node --version)"

    # tree-sitter-cli (needed by nvim-treesitter to compile parsers)
    if ! command -v tree-sitter &>/dev/null; then
        echo "==> Installing tree-sitter-cli via npm..."
        sudo npm install -g tree-sitter-cli
        echo "ok: tree-sitter $(tree-sitter --version)"
    else
        echo "ok: tree-sitter already installed"
    fi

    # Go (official tarball, apt version is often outdated)
    if ! command -v go &>/dev/null; then
        echo "==> Installing Go..."
        GO_VERSION=$(curl -s 'https://go.dev/VERSION?m=text' | head -1)
        curl -Lo /tmp/go.tar.gz "https://go.dev/dl/${GO_VERSION}.linux-amd64.tar.gz"
        sudo rm -rf /usr/local/go
        sudo tar -C /usr/local -xzf /tmp/go.tar.gz
        rm -f /tmp/go.tar.gz
    fi
    export PATH="/usr/local/go/bin:$PATH"
    echo "ok: go $(go version)"
}

install_deps_brew() {
    echo "==> Installing dependencies via Homebrew..."

    if ! command -v brew &>/dev/null; then
        echo "==> Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi

    brew install \
        fd \
        ripgrep \
        fzf \
        lazygit \
        python3 \
        go \
        fnm \
        tree-sitter-cli \
        terminal-notifier

    if ! command -v node &>/dev/null; then
        echo "==> Installing Node.js LTS via fnm..."
        eval "$(fnm env)"
        fnm install --lts
        fnm default lts-latest
    fi
    echo "ok: node $(node --version)"
}

case "$(uname -s)" in
    Darwin)
        install_deps_brew
        ;;
    Linux)
        if command -v apt-get &>/dev/null; then
            install_deps_apt
        else
            echo "warn: unsupported Linux distro (no apt-get), skipping dependency installation"
        fi
        ;;
    *)
        echo "warn: unsupported OS $(uname -s), skipping dependency installation"
        ;;
esac

echo "==> Dependencies installed."

# ---------------------------------------------------------------------------
# 2. Oh My Zsh
# ---------------------------------------------------------------------------

if [ ! -d "$HOME/.oh-my-zsh" ]; then
    echo "==> Installing Oh My Zsh..."
    sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
    echo "ok: oh-my-zsh installed"
else
    echo "ok: oh-my-zsh already installed"
fi

# Install custom themes (e.g. nara)
if [ -d "$DOTFILES_DIR/zsh/custom/themes" ]; then
    mkdir -p "$HOME/.oh-my-zsh/custom/themes"
    for theme in "$DOTFILES_DIR/zsh/custom/themes"/*.zsh-theme; do
        [ -f "$theme" ] && ln -sf "$theme" "$HOME/.oh-my-zsh/custom/themes/$(basename "$theme")"
    done
    echo "ok: custom themes linked"
fi

# Install custom zsh plugins/functions
for zshfile in "$DOTFILES_DIR/zsh/custom"/*.zsh; do
    [ -f "$zshfile" ] && ln -sf "$zshfile" "$HOME/.oh-my-zsh/custom/$(basename "$zshfile")"
done
echo "ok: custom zsh files linked"

# ---------------------------------------------------------------------------
# 3. Symlink dotfiles
# ---------------------------------------------------------------------------

# source -> target
declare -A LINKS=(
    ["$DOTFILES_DIR/zsh/.zshrc"]="$HOME/.zshrc"
    ["$DOTFILES_DIR/tmux/.tmux.conf"]="$HOME/.tmux.conf"
    ["$DOTFILES_DIR/git/.gitconfig"]="$HOME/.gitconfig"
    ["$DOTFILES_DIR/nvim"]="$HOME/.config/nvim"
    ["$DOTFILES_DIR/ghostty"]="$HOME/.config/ghostty"
    ["$DOTFILES_DIR/git/attributes"]="$HOME/.config/git/attributes"
    ["$DOTFILES_DIR/lazygit/config.yml"]="$HOME/Library/Application Support/lazygit/config.yml"

    ["$DOTFILES_DIR/claude/settings.json"]="$HOME/.claude/settings.json"
    ["$DOTFILES_DIR/claude/settings.local.json"]="$HOME/.claude/settings.local.json"
    ["$DOTFILES_DIR/pi/AGENTS.md"]="$HOME/.pi/agent/AGENTS.md"
    ["$DOTFILES_DIR/pi/agents"]="$HOME/.pi/agent/agents"
    ["$DOTFILES_DIR/pi/mcp.json"]="$HOME/.pi/agent/mcp.json"
    ["$DOTFILES_DIR/pi/models.json"]="$HOME/.pi/agent/models.json"
    ["$DOTFILES_DIR/pi/prompts"]="$HOME/.pi/agent/prompts"
    ["$DOTFILES_DIR/pi/settings.json"]="$HOME/.pi/agent/settings.json"
    ["$DOTFILES_DIR/pi/themes"]="$HOME/.pi/agent/themes"
)

# AGENTS.md is the single source of truth for all agents
AGENTS_TARGETS=(
    "$HOME/AGENTS.md"
    "$HOME/.claude/CLAUDE.md"
)

mkdir -p "$HOME/.config" "$HOME/.claude" "$HOME/Library/Application Support/lazygit" "$HOME/.pi/agent/extensions"

link_file() {
    local src="$1" target="$2"
    if [ -L "$target" ] && [ "$(readlink "$target")" = "$src" ]; then
        echo "ok: $target -> $src (already linked)"
        return
    fi
    if [ -e "$target" ] && [ ! -L "$target" ]; then
        mv "$target" "${target}.bak"
        echo "backed up: $target -> ${target}.bak"
    elif [ -L "$target" ]; then
        rm "$target"
        echo "removed stale symlink: $target"
    fi
    ln -s "$src" "$target"
    echo "linked: $target -> $src"
}

for src in "${!LINKS[@]}"; do
    link_file "$src" "${LINKS[$src]}"
done

# AGENTS.md -> all agent config locations
for target in "${AGENTS_TARGETS[@]}"; do
    link_file "$DOTFILES_DIR/AGENTS.md" "$target"
done

# Claude skills: link each skill dir individually (some skills like frontend-design
# are external symlinks managed outside dotfiles, so we can't symlink the whole dir)
for skill in "$DOTFILES_DIR/claude/skills"/*/; do
    [ -d "$skill" ] || continue
    link_file "$skill" "$HOME/.claude/skills/$(basename "$skill")"
done

# Pi extensions: link each extension individually so non-dotfiles extensions can coexist
for ext in "$DOTFILES_DIR/pi/extensions"/*; do
    name="$(basename "$ext")"
    [[ "$name" == "package-lock.json" ]] && continue
    link_file "$ext" "$HOME/.pi/agent/extensions/$name"
done

# ---------------------------------------------------------------------------
# 4. iTerm2 preferences (macOS only)
# ---------------------------------------------------------------------------

if [ "$(uname -s)" = "Darwin" ] && [ -d "$DOTFILES_DIR/iterm2" ]; then
    # Remove stale symlink if present (old approach)
    if [ -L "$HOME/Library/Preferences/com.googlecode.iterm2.plist" ]; then
        rm "$HOME/Library/Preferences/com.googlecode.iterm2.plist"
        echo "removed stale iterm2 plist symlink"
    fi

    # Tell iTerm to load/save preferences from the dotfiles folder natively
    defaults write com.googlecode.iterm2 PrefsCustomFolder -string "$DOTFILES_DIR/iterm2"
    defaults write com.googlecode.iterm2 LoadPrefsFromCustomFolder -bool true
    echo "ok: iTerm2 configured to load preferences from $DOTFILES_DIR/iterm2"
fi

# ---------------------------------------------------------------------------
# 5. Pi Dashboard daemon (macOS only)
# ---------------------------------------------------------------------------

if [ "$(uname -s)" = "Darwin" ]; then
    DASHBOARD_EXT="$DOTFILES_DIR/pi/extensions/dashboard"
    PLIST_SRC="$DASHBOARD_EXT/com.pi.dashboard.plist"
    PLIST_DST="$HOME/Library/LaunchAgents/com.pi.dashboard.plist"

    # install dashboard npm deps if needed
    if [ -f "$DASHBOARD_EXT/package.json" ] && [ ! -d "$DASHBOARD_EXT/node_modules" ]; then
        echo "==> Installing pi dashboard dependencies..."
        (cd "$DASHBOARD_EXT" && npm install --silent)
    fi

    # build frontend
    if [ -f "$DASHBOARD_EXT/vite.config.ts" ]; then
        echo "==> Building pi dashboard frontend..."
        (cd "$DASHBOARD_EXT" && npx vite build --logLevel error)
    fi

    # create dashboard config if it doesn't exist
    mkdir -p "$HOME/.pi/dashboard"
    if [ ! -f "$HOME/.pi/dashboard/config.json" ]; then
        echo '{"repos":[]}' > "$HOME/.pi/dashboard/config.json"
        echo "ok: created ~/.pi/dashboard/config.json (add repo paths to monitor)"
    fi

    # install and load launchd daemon
    if [ -f "$PLIST_SRC" ]; then
        link_file "$PLIST_SRC" "$PLIST_DST"
        launchctl unload "$PLIST_DST" 2>/dev/null || true
        launchctl load "$PLIST_DST"
        echo "ok: pi dashboard daemon loaded (http://127.0.0.1:7778)"
    fi
fi
