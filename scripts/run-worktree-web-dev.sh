#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <worktree_root> <port> <label> [app_rel_path]" >&2
  exit 1
fi

WORKTREE_ROOT="$1"
PORT="$2"
LABEL="$3"
APP_REL_PATH="${4:-apps/web}"

if [[ ! -d "$WORKTREE_ROOT" ]]; then
  echo "Worktree root not found: $WORKTREE_ROOT" >&2
  exit 1
fi

APP_DIR="${WORKTREE_ROOT}/${APP_REL_PATH}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "App directory not found: $APP_DIR" >&2
  exit 1
fi

BRANCH_NAME="$(git -C "$WORKTREE_ROOT" branch --show-current 2>/dev/null || true)"

if command -v lsof >/dev/null 2>&1; then
  PORT_PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$PORT_PIDS" ]]; then
    kill $PORT_PIDS >/dev/null 2>&1 || true
  fi
fi

sleep 1

echo "Starting ${LABEL} from ${WORKTREE_ROOT} on port ${PORT}"
echo "Branch: ${BRANCH_NAME:-unknown}"

cd "$APP_DIR"
export NEXT_PUBLIC_DEV_INSTANCE_LABEL="$LABEL"
export NEXT_PUBLIC_DEV_WORKTREE_PATH="$WORKTREE_ROOT"
export NEXT_PUBLIC_DEV_GIT_BRANCH="${BRANCH_NAME:-unknown}"
export NEXT_PUBLIC_DEV_PORT="$PORT"

exec pnpm dev --port "$PORT"
