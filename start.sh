#!/usr/bin/env bash
# Convenience wrapper — delegates to infra/scripts/start.sh
exec "$(dirname "$0")/infra/scripts/start.sh" "$@"
