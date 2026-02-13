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
        fnm

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
