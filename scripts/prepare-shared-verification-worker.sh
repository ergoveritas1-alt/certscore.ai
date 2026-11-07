#!/usr/bin/env bash
set -euo pipefail

candidate=$(mktemp -d "${RUNNER_TEMP}/release-bootstrap.XXXXXX")
keep_candidate=false
cleanup() {
  if [[ "$keep_candidate" != true ]]; then rm -rf -- "$candidate"; fi
}
trap cleanup EXIT

browser_pid=''
if [[ "$NEEDS_CHROMIUM" == true ]]; then
  (unset GH_TOKEN GITHUB_TOKEN; pnpm exec playwright install chromium) &
  browser_pid=$!
fi

started=$(date +%s%3N)
deadline=$((started + 45000))
attempts=0
while :; do
  attempts=$((attempts + 1))
  if timeout 6s gh run download "$GITHUB_RUN_ID" --repo "$GITHUB_REPOSITORY" \
    --name "release-bootstrap-$GITHUB_RUN_ATTEMPT" --dir "$candidate"; then
    keep_candidate=true
    break
  fi
  if [[ -z "$browser_pid" ]] || ! kill -0 "$browser_pid" 2>/dev/null || (( $(date +%s%3N) >= deadline )); then break; fi
  rm -rf -- "$candidate"
  mkdir -- "$candidate"
  sleep 2
done
printf 'Shared bootstrap: found=%s attempts=%s lookup_ms=%s\n' "$keep_candidate" "$attempts" "$(( $(date +%s%3N) - started ))"

if [[ -n "$browser_pid" ]]; then
  wait "$browser_pid" || { result=$?; keep_candidate=false; exit "$result"; }
fi
if [[ "$keep_candidate" == true ]]; then echo "directory=$candidate" >> "$GITHUB_OUTPUT"; fi
