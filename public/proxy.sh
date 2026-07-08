#!/usr/bin/env sh
# shellproxy installer  -  https://cishoon.top/proxy.sh
#
# One-liner:
#   curl -fsSL https://cishoon.top/proxy.sh | sh
# Uninstall:
#   curl -fsSL https://cishoon.top/proxy.sh | sh -s -- uninstall
#
# Installs a portable `proxy` shell function (bash + zsh) with named presets,
# a default target, autostart, and a reverse-SSH-tunnel helper.
set -e

INSTALL_DIR="${SHELLPROXY_DIR:-$HOME/.config/shellproxy}"
FUNC_FILE="$INSTALL_DIR/proxy.sh"
CONF_FILE="$INSTALL_DIR/config"
MARKER="# >>> shellproxy >>>"
MARKER_END="# <<< shellproxy <<<"

green() { printf '\033[32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }

uninstall() {
    for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.profile"; do
        [ -f "$rc" ] || continue
        grep -q "shellproxy" "$rc" 2>/dev/null || continue
        awk -v s="$MARKER" -v e="$MARKER_END" '
            $0==s {skip=1}
            skip==0 {print}
            $0==e {skip=0}
        ' "$rc" > "$rc.shellproxy.tmp" && mv "$rc.shellproxy.tmp" "$rc"
        green "[OK] Removed shellproxy block from $rc"
    done
    yellow "[Note] Config kept at $INSTALL_DIR (delete it manually to purge)."
    green "[Done] Uninstalled. Open a new shell to take effect."
}

case "${1:-install}" in
    uninstall|remove) uninstall; exit 0 ;;
esac

mkdir -p "$INSTALL_DIR"

# ---- write the proxy function (sourced by interactive shells) ----------------
cat > "$FUNC_FILE" <<'PROXY_EOF'
# shellproxy - portable proxy toggle for bash & zsh
# Installed by https://cishoon.top/proxy.sh ; settings live in the config file.

_proxy_cfg() { printf '%s' "${SHELLPROXY_CONFIG:-$HOME/.config/shellproxy/config}"; }

_proxy_get() {  # _proxy_get <key>
    cfg="$(_proxy_cfg)"
    [ -f "$cfg" ] || return 0
    grep "^$1=" "$cfg" 2>/dev/null | head -n1 | cut -d= -f2-
}

_proxy_set() {  # _proxy_set <key> <value>
    cfg="$(_proxy_cfg)"; mkdir -p "$(dirname "$cfg")"; tmp="$cfg.tmp.$$"
    if [ -f "$cfg" ]; then grep -v "^$1=" "$cfg" > "$tmp"; else : > "$tmp"; fi
    printf '%s=%s\n' "$1" "$2" >> "$tmp"; mv "$tmp" "$cfg"
}

_proxy_preset_get() {  # _proxy_preset_get <name> -> host:port
    cfg="$(_proxy_cfg)"
    [ -f "$cfg" ] || return 0
    grep "^preset $1 " "$cfg" 2>/dev/null | head -n1 | awk '{print $3}'
}

_proxy_fallback() { fp="$(_proxy_get fallback_port)"; [ -z "$fp" ] && fp="7890"; printf '%s' "$fp"; }

_proxy_resolve() {  # _proxy_resolve <target-or-empty> -> host:port
    fp="$(_proxy_fallback)"; target="$1"
    [ -z "$target" ] && target="$(_proxy_get default)"
    [ -z "$target" ] && target="127.0.0.1:$fp"
    hp="$(_proxy_preset_get "$target")"; [ -n "$hp" ] && target="$hp"
    host="${target%%:*}"; port="${target##*:}"
    [ "$port" = "$host" ] && port="$fp"
    printf '%s:%s\n' "$host" "$port"
}

proxy() {
    case "$1" in
        on)
            hp="$(_proxy_resolve "$2")"; host_ip="${hp%%:*}"; proxy_port="${hp##*:}"
            export http_proxy="http://${host_ip}:${proxy_port}"
            export https_proxy="http://${host_ip}:${proxy_port}"
            export HTTP_PROXY="http://${host_ip}:${proxy_port}"
            export HTTPS_PROXY="http://${host_ip}:${proxy_port}"
            export ALL_PROXY="socks5://${host_ip}:${proxy_port}"
            export no_proxy="localhost,127.0.0.1,localaddress,.localdomain.com,${host_ip}"
            printf '\033[32m[OK] Proxy is ON. Connected to %s:%s\033[0m\n' "$host_ip" "$proxy_port"
            ;;
        off)
            unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY no_proxy
            printf '\033[31m[OK] Proxy is OFF.\033[0m\n'
            ;;
        status)
            if [ -n "$http_proxy" ]; then
                printf '\033[32m[Status] Proxy is currently ON (%s)\033[0m\n' "$http_proxy"
            else
                printf '\033[31m[Status] Proxy is currently OFF\033[0m\n'
            fi
            ;;
        ssh)
            # Print (and OSC52-copy) a reverse-tunnel command to run on your LOCAL
            # machine, mapping this server's <remote_port> to your local <local_port>.
            remote_port="${2:-$(_proxy_fallback)}"; local_port="${3:-7890}"
            current_user="$(whoami)"
            current_host="$(echo "$SSH_CONNECTION" | awk '{print $3}')"
            [ -z "$current_host" ] && current_host="<server_ip>"
            ssh_cmd="ssh -o ServerAliveInterval=30 -fNT -R ${remote_port}:127.0.0.1:${local_port} ${current_user}@${current_host}"
            printf '\033[36m[Info] Reverse-tunnel command (run on your local machine):\033[0m\n'
            printf '\033[33m%s\033[0m\n' "$ssh_cmd"
            b64_cmd="$(printf '%s' "$ssh_cmd" | base64 -w 0 2>/dev/null || printf '%s' "$ssh_cmd" | base64)"
            printf '\033]52;c;%s\a' "$b64_cmd"
            printf '\033[32m[Success] Copied to your local clipboard (if terminal supports OSC52).\033[0m\n'
            ;;
        default)
            if [ -n "$2" ]; then
                _proxy_set default "$2"
                printf '[OK] Default -> %s  (%s)\n' "$2" "$(_proxy_resolve)"
            else
                printf 'Default: %s  (%s)\n' "$(_proxy_get default)" "$(_proxy_resolve)"
            fi
            ;;
        autostart)
            case "$2" in
                on|off) _proxy_set autostart "$2"; printf '[OK] Autostart -> %s\n' "$2" ;;
                "")     printf 'Autostart: %s\n' "$(_proxy_get autostart)" ;;
                *)      echo "Usage: proxy autostart {on|off}" ;;
            esac
            ;;
        preset)
            cfg="$(_proxy_cfg)"
            case "$2" in
                add)
                    if [ -z "$3" ] || [ -z "$4" ]; then
                        echo "Usage: proxy preset add <name> <host[:port]>"; return 1
                    fi
                    hp="$4"; case "$hp" in *:*) ;; *) hp="$hp:$(_proxy_fallback)" ;; esac
                    mkdir -p "$(dirname "$cfg")"; tmp="$cfg.tmp.$$"
                    if [ -f "$cfg" ]; then grep -v "^preset $3 " "$cfg" > "$tmp"; else : > "$tmp"; fi
                    printf 'preset %s %s\n' "$3" "$hp" >> "$tmp"; mv "$tmp" "$cfg"
                    printf '[OK] Preset %s = %s\n' "$3" "$hp"
                    ;;
                rm|remove|del)
                    if [ -z "$3" ]; then echo "Usage: proxy preset rm <name>"; return 1; fi
                    if [ -f "$cfg" ] && grep -q "^preset $3 " "$cfg"; then
                        tmp="$cfg.tmp.$$"; grep -v "^preset $3 " "$cfg" > "$tmp"; mv "$tmp" "$cfg"
                        printf '[OK] Removed preset %s\n' "$3"
                    else
                        echo "No such preset: $3"; return 1
                    fi
                    ;;
                list|"")
                    [ -f "$cfg" ] && grep "^preset " "$cfg" 2>/dev/null | awk '{printf "  %-12s %s\n", $2, $3}'
                    ;;
                *) echo "Usage: proxy preset {list|add <name> <host[:port]>|rm <name>}" ;;
            esac
            ;;
        help|-h|--help|"")
            echo "proxy - toggle HTTP/HTTPS/SOCKS proxy env vars"
            echo ""
            echo "Usage:"
            echo "  proxy on [preset|host[:port]]   Enable (bare 'on' uses the default)"
            echo "  proxy off                       Disable and unset all proxy vars"
            echo "  proxy status                    Show current proxy state"
            echo "  proxy ssh [rport] [lport]       Print/copy a reverse-tunnel ssh command"
            echo ""
            echo "  proxy default [target]          Show / set the default target"
            echo "  proxy autostart [on|off]        Show / set auto-enable on shell start"
            echo "  proxy preset list               List presets"
            echo "  proxy preset add <name> <h[:p]> Add / update a preset"
            echo "  proxy preset rm <name>          Remove a preset"
            echo "  proxy help                      Show this help"
            echo ""
            echo "Settings:"
            printf '  default    %s  (%s)\n' "$(_proxy_get default)" "$(_proxy_resolve)"
            printf '  autostart  %s\n' "$(_proxy_get autostart)"
            printf '  config     %s\n' "$(_proxy_cfg)"
            echo ""
            echo "Presets:"
            cfg="$(_proxy_cfg)"
            [ -f "$cfg" ] && grep "^preset " "$cfg" 2>/dev/null | awk '{printf "  %-12s %s\n", $2, $3}'
            ;;
        *)
            echo "proxy: unknown command '$1'"
            echo "Run 'proxy help' for usage."
            ;;
    esac
}

# Auto-enable on shell startup when configured.
[ "$(_proxy_get autostart)" = "on" ] && proxy on
PROXY_EOF

# ---- write default config only if absent (never clobber user's presets) ------
if [ ! -f "$CONF_FILE" ]; then
    cat > "$CONF_FILE" <<'CONF_EOF'
# shellproxy config - safe to edit by hand, or manage via `proxy` commands.
default=local
autostart=off
fallback_port=7890
# presets:  preset <name> <host[:port]>
preset local 127.0.0.1:7890
CONF_EOF
fi

# ---- hook the function into the user's shell rc files (idempotent) -----------
patched=0
for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [ -f "$rc" ] || continue
    if grep -q "shellproxy" "$rc" 2>/dev/null; then
        patched=$((patched + 1)); continue
    fi
    {
        printf '\n%s\n' "$MARKER"
        printf '[ -f "%s" ] && . "%s"\n' "$FUNC_FILE" "$FUNC_FILE"
        printf '%s\n' "$MARKER_END"
    } >> "$rc"
    green "[OK] Hooked into $rc"
    patched=$((patched + 1))
done

if [ "$patched" -eq 0 ]; then
    case "${SHELL##*/}" in zsh) rc="$HOME/.zshrc" ;; *) rc="$HOME/.bashrc" ;; esac
    {
        printf '\n%s\n' "$MARKER"
        printf '[ -f "%s" ] && . "%s"\n' "$FUNC_FILE" "$FUNC_FILE"
        printf '%s\n' "$MARKER_END"
    } >> "$rc"
    green "[OK] Created and hooked into $rc"
fi

green "[Done] shellproxy installed."
yellow "Reload your shell:  source ~/.zshrc   (or ~/.bashrc), then run:  proxy help"
