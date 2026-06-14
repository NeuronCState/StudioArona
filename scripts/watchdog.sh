#!/usr/bin/env bash
# StudioArona Watchdog - keep all services alive
# Launchd-managed. Detects which services are down and restarts them.
set +e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="/tmp/studio-watchdog.log"

# launchd 启动的 env PATH 不完整，强制加 ~/.local/bin（hermes 带的 node 在这里）
export PATH="$HOME/.local/bin:$HOME/.hermes/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

log() { printf "[%s] %s\n" "$(date +%H:%M:%S)" "$*" >> "$LOG"; }

is_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

docker_ok() {
  docker info >/dev/null 2>&1
}

restart_bridge() {
  if ! is_listening 18790; then
    log "bridge :18790 down — restarting"
    (cd "$ROOT" && BRIDGE_PORT=18790 nohup node services/agent/bridge/server.js >> /tmp/bridge.log 2>&1) &
    disown
  fi
}

restart_llm_gateway() {
  if ! is_listening 8645; then
    log "LLM Gateway :8645 down — restarting"
    (cd "$ROOT" && nohup "$ROOT/.venv/bin/python" -m uvicorn main:app \
      --app-dir services/llm_gateway --host 127.0.0.1 --port 8645 \
      --reload --reload-dir services/llm_gateway > /tmp/llm-gw.log 2>&1) &
    disown
  fi
}

restart_perception() {
  if ! is_listening 8002; then
    log "perception :8002 down — restarting"
    (cd "$ROOT" && nohup "$ROOT/.venv/bin/python" -m uvicorn app.main:app \
      --app-dir services/perception --host 127.0.0.1 --port 8002 \
      --reload --reload-dir services/perception/app > /tmp/perception.log 2>&1) &
    disown
  fi
}

restart_api_gateway() {
  if ! is_listening 8080; then
    log "api-gateway :8080 down — restarting"
    (cd "$ROOT" && DATABASE_URL='postgresql+asyncpg://javis:javis@localhost:5432/javis' \
      JWT_SECRET=test \
      nohup "$ROOT/.venv/bin/python" -m uvicorn app.main:app \
      --app-dir services/api-gateway --host 127.0.0.1 --port 8080 \
      --log-level warning > /tmp/api-gateway.log 2>&1) &
    disown
  fi
}

ensure_docker() {
  if ! docker_ok; then
    log "Docker daemon down — opening Docker Desktop"
    osascript -e 'tell application "Docker Desktop" to activate' >/dev/null 2>&1 || open -a "Docker Desktop"
    return 1
  fi
  return 0
}

ensure_pg_redis() {
  ensure_docker || return 0
  if ! is_listening 5432 || ! is_listening 6379; then
    log "PG/Redis not listening — starting"
    docker compose -f "$ROOT/infra/compose/docker-compose.yml" up -d postgres redis >> "$LOG" 2>&1
  fi
}

main_loop() {
  log "watchdog started (root=$ROOT, node=$(command -v node))"
  while true; do
    ensure_docker
    ensure_pg_redis
    restart_api_gateway
    restart_bridge
    restart_llm_gateway
    restart_perception
    sleep 30
  done
}

if [ "${1:-}" = "--once" ]; then
  ensure_docker
  ensure_pg_redis
  restart_api_gateway
  restart_bridge
  restart_llm_gateway
  restart_perception
  log "one-shot check done"
else
  main_loop
fi
