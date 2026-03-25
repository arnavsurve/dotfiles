# iTerm2 tab color via escape sequences
# Usage: tab <color|#hex|reset>

_iterm_tab_rgb() {
  echo -ne "\033]6;1;bg;red;brightness;$1\a\033]6;1;bg;green;brightness;$2\a\033]6;1;bg;blue;brightness;$3\a"
}

# pastel palette (no red)
_tab_pastels=(
  "180 210 240"  # soft blue
  "200 230 200"  # soft green
  "230 210 180"  # warm sand
  "210 190 230"  # soft purple
  "180 220 220"  # soft cyan
  "230 200 220"  # soft pink
  "220 220 190"  # soft yellow
  "190 210 210"  # muted teal
  "220 200 240"  # lavender
  "200 220 180"  # sage
  "230 210 200"  # peach
  "180 200 220"  # steel blue
)

tab() {
  if [[ -z "$1" ]]; then
    echo "Usage: tab <color|#hex|reset|random>"
    echo "Colors: orange, yellow, green, cyan, blue, purple, pink, white, gray"
    return 1
  fi

  case "$1" in
    reset)    echo -ne "\033]6;1;bg;*;default\a" ;;
    random)
      local entry="${_tab_pastels[$((RANDOM % ${#_tab_pastels[@]} + 1))]}"
      _iterm_tab_rgb ${=entry}
      ;;
    orange)   _iterm_tab_rgb 220 140 40 ;;
    yellow)   _iterm_tab_rgb 210 190 50 ;;
    green)    _iterm_tab_rgb 60 180 80 ;;
    cyan)     _iterm_tab_rgb 50 180 200 ;;
    blue)     _iterm_tab_rgb 50 100 220 ;;
    purple)   _iterm_tab_rgb 140 80 200 ;;
    pink)     _iterm_tab_rgb 210 100 160 ;;
    white)    _iterm_tab_rgb 220 220 220 ;;
    gray)     _iterm_tab_rgb 120 120 120 ;;
    \#*)
      local hex="${1#\#}"
      _iterm_tab_rgb $((16#${hex:0:2})) $((16#${hex:2:2})) $((16#${hex:4:2}))
      ;;
    *)
      echo "Unknown color: $1"
      echo "Try a named color or #hex (e.g. tab blue, tab #ff6600)"
      return 1
      ;;
  esac
}

# auto-set a random pastel on each new interactive shell
tab random
