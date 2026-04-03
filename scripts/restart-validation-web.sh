#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec bash "${ROOT_DIR}/scripts/run-worktree-web-dev.sh" "$ROOT_DIR" "3001" "validation-web" "apps/validation-web"
