#!/usr/bin/env bash
set -euo pipefail

for forbidden_path in \
  .github/workflows/scanner-ecs-health.yml \
  scripts/check-ws01-scanner-autoscaling-safety.ts \
  scripts/check-scanner-deploy-health.sh; do
  if [[ -e "${forbidden_path}" ]]; then
    echo "ERROR: forbidden scanner ECS artifact exists: ${forbidden_path}" >&2
    exit 1
  fi
done

if grep -R -n --exclude='assert-no-scanner-ecs.sh' --exclude='no-scanner-ecs.yml' \
  -E 'ws01-scanner-worker|AWS_SCANNER_ECS_SERVICE|OPS_WAKE_SCANNER_ON_QUEUE|ops:check:scanner-deploy' \
  .github/workflows scripts package.json 2>/dev/null; then
  echo "ERROR: active operations code contains a prohibited scanner ECS path." >&2
  exit 1
fi

echo "PASS: production scanner operations are WC01 v2 DAG Lambda only."
