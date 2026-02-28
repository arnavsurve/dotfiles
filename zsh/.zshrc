# If you come from bash you might have to change your $PATH.
# export PATH=$HOME/bin:$HOME/.local/bin:/usr/local/bin:$PATH

# Path to your Oh My Zsh installation.
export ZSH="$HOME/.oh-my-zsh"

# Set name of the theme to load --- if set to "random", it will
# load a random theme each time Oh My Zsh is loaded, in which case,
# to know which specific one was loaded, run: echo $RANDOM_THEME
# See https://github.com/ohmyzsh/ohmyzsh/wiki/Themes
ZSH_THEME="nara"

# Set list of themes to pick from when loading at random
# Setting this variable when ZSH_THEME=random will cause zsh to load
# a theme from this variable instead of looking in $ZSH/themes/
# If set to an empty array, this variable will have no effect.
# ZSH_THEME_RANDOM_CANDIDATES=( "robbyrussell" "agnoster" )

# Uncomment the following line to use case-sensitive completion.
# CASE_SENSITIVE="true"

# Uncomment the following line to use hyphen-insensitive completion.
# Case-sensitive completion must be off. _ and - will be interchangeable.
# HYPHEN_INSENSITIVE="true"

# Uncomment one of the following lines to change the auto-update behavior
# zstyle ':omz:update' mode disabled  # disable automatic updates
# zstyle ':omz:update' mode auto      # update automatically without asking
# zstyle ':omz:update' mode reminder  # just remind me to update when it's time

# Uncomment the following line to change how often to auto-update (in days).
# zstyle ':omz:update' frequency 13

# Uncomment the following line if pasting URLs and other text is messed up.
# DISABLE_MAGIC_FUNCTIONS="true"

# Uncomment the following line to disable colors in ls.
# DISABLE_LS_COLORS="true"

# Uncomment the following line to disable auto-setting terminal title.
# DISABLE_AUTO_TITLE="true"

# Uncomment the following line to enable command auto-correction.
# ENABLE_CORRECTION="true"

# Uncomment the following line to display red dots whilst waiting for completion.
# You can also set it to another string to have that shown instead of the default red dots.
# e.g. COMPLETION_WAITING_DOTS="%F{yellow}waiting...%f"
# Caution: this setting can cause issues with multiline prompts in zsh < 5.7.1 (see #5765)
# COMPLETION_WAITING_DOTS="true"

# Uncomment the following line if you want to disable marking untracked files
# under VCS as dirty. This makes repository status check for large repositories
# much, much faster.
# DISABLE_UNTRACKED_FILES_DIRTY="true"

# Uncomment the following line if you want to change the command execution time
# stamp shown in the history command output.
# You can set one of the optional three formats:
# "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
# or set a custom format using the strftime function format specifications,
# see 'man strftime' for details.
# HIST_STAMPS="mm/dd/yyyy"

# Would you like to use another custom folder than $ZSH/custom?
# ZSH_CUSTOM=/path/to/new-custom-folder

# Which plugins would you like to load?
# Standard plugins can be found in $ZSH/plugins/
# Custom plugins may be added to $ZSH_CUSTOM/plugins/
# Example format: plugins=(rails git textmate ruby lighthouse)
# Add wisely, as too many plugins slow down shell startup.
plugins=(git direnv)

source $ZSH/oh-my-zsh.sh

# User configuration

# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
# export LANG=en_US.UTF-8

# Preferred editor for local and remote sessions
# if [[ -n $SSH_CONNECTION ]]; then
#   export EDITOR='vim'
# else
#   export EDITOR='nvim'
# fi

export EDITOR='nvim'

# Compilation flags
# export ARCHFLAGS="-arch $(uname -m)"

# Set personal aliases, overriding those provided by Oh My Zsh libs,
# plugins, and themes. Aliases can be placed here, though Oh My Zsh
# users are encouraged to define aliases within a top-level file in
# the $ZSH_CUSTOM folder, with .zsh extension. Examples:
# - $ZSH_CUSTOM/aliases.zsh
# - $ZSH_CUSTOM/macos.zsh
# For a full list of active aliases, run `alias`.
#
# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"

alias vi="nvim"
alias lg="lazygit"
alias y="yazi"
alias claude="claude --dangerously-skip-permissions"
alias pwdc="pwd | pbcopy"

# bare clone a repo for worktree-based development
# usage: gbare <repo-url> [directory]
gbare() {
  if [[ -z "$1" ]]; then
    echo "Usage: gbare <repo-url> [directory]"
    return 1
  fi
  local repo="$1"
  local dir="${2:-$(basename "$repo" .git)}"
  mkdir -p "$dir" && cd "$dir" \
    && git clone --bare "$repo" .bare \
    && echo "gitdir: ./.bare" > .git \
    && git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*" \
    && git fetch origin \
    && echo "Bare repo ready in $(pwd). Use 'wt add <branch>' to create worktrees."
}

# escher
alias emain="cd ~/dev/escher/main && git pull"
alias eox="yarn run lint && yarn run format"
alias eroot="cd ~/dev/escher"

unalias gd 2>/dev/null
alias gd="$HOME/dev/gd/gd"

# worktrees
wt() {
  case "$1" in
    add)
      if [[ -z "$2" ]]; then
        echo "Usage: wt add <branch> [upstream]"
        return 1
      fi
      local branch="$2"
      local upstream="${3:-main}"
      git worktree add "$branch" -b "$branch" "$upstream" && cd "$branch"
      ;;
    ls)
      shift
      git worktree list "$@"
      ;;
    rm)
      shift
      git worktree remove "$@"
      ;;
    mv)
      shift
      git worktree move "$@"
      ;;
    cd)
      if ! command -v fzf &>/dev/null; then
        echo "fzf is not installed!"
        echo "Worktrees:"
        git worktree list
        return 1
      fi
      local dir
      dir="$(git worktree list --porcelain | grep "^worktree " | sed 's/^worktree //' | fzf)"
      if [[ -n "$dir" ]]; then
        cd "$dir"
      fi
      ;;
    remote)
      if [[ -z "$2" ]]; then
        echo "Usage: wt remote <branch>"
        return 1
      fi
      local branch="$2"
      git fetch origin "$branch" || return 1
      if git worktree list --porcelain | grep -q "branch refs/heads/$branch$"; then
        echo "Worktree for '$branch' already exists, resetting to origin/$branch"
        git -C "$branch" reset --hard "origin/$branch"
      else
        git branch -D "$branch" 2>/dev/null
        git worktree add "$branch" -b "$branch" "origin/$branch"
      fi
      [[ -d "$branch" ]] && cd "$branch"
      ;;
    ready)
        yarn install && doppler setup --no-interactive
        ;;
    *)
      git worktree "$@"
      ;;
  esac
}

export PATH="$HOME/.local/bin:$PATH"

# fnm (node version manager)
export PATH="$HOME/.local/share/fnm:$PATH"
command -v fnm &>/dev/null && eval "$(fnm env --use-on-cd)"

# corepack (needs sudo on Linux if node installed system-wide)
if command -v corepack &>/dev/null; then
    corepack enable 2>/dev/null || sudo corepack enable 2>/dev/null || true
fi

# direnv
command -v direnv &>/dev/null && eval "$(direnv hook zsh)"

# Go
[ -d /usr/local/go/bin ] && export PATH="/usr/local/go/bin:$PATH"
command -v go &>/dev/null && export PATH="$PATH:$(go env GOPATH)/bin"

# bun
export BUN_INSTALL="$HOME/.bun"
[ -s "$BUN_INSTALL/_bun" ] && source "$BUN_INSTALL/_bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Sync split-diffs theme with macOS light/dark mode
sync_split_diffs_theme() {
  if defaults read -g AppleInterfaceStyle &>/dev/null; then
    git config --global split-diffs.theme-name dark
  else
    git config --global split-diffs.theme-name light
  fi
}
sync_split_diffs_theme
