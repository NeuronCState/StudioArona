#!/usr/bin/env bash
# 一键装 watchdog 为 launchd 服务
# 用法: ./run-watchdog.sh install | uninstall | status
set -e
PLIST="$HOME/Library/LaunchAgents/com.studioarona.watchdog.plist"
WATCHDOG="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/watchdog.sh"
case "${1:-status}" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.studioarona.watchdog</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$WATCHDOG</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/studio-watchdog.log</string>
  <key>StandardErrorPath</key><string>/tmp/studio-watchdog.log</string>
  <key>WorkingDirectory</key><string>$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)</string>
</dict>
</plist>
PLIST
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "✓ watchdog installed and started"
    launchctl list | grep com.studioarona.watchdog
    ;;
  uninstall)
    launchctl unload "$PLIST" 2>/dev/null || true
    /Users/zhangxuanning/.mavis/bin/mavis-trash '$PLIST' '2>/dev/null' echo '✓ watchdog uninstalled' ;;
  status)
    if launchctl list | grep -q com.studioarona.watchdog; then
      echo "✓ watchdog running"
      launchctl list | grep com.studioarona.watchdog
    else
      echo "✗ watchdog not running — run ./run-watchdog.sh install"
    fi
    tail -3 /tmp/studio-watchdog.log 2>/dev/null
    ;;
  *)
    echo "usage: $0 {install|uninstall|status}"
    exit 1
    ;;
esac
