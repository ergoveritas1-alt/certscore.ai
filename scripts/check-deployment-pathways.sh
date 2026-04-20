#!/usr/bin/env bash
set -euo pipefail

expected_remote="${EXPECTED_GIT_REMOTE:-git@github.com:ergoveritas1-alt/certscore.ai.git}"
expected_web_platform="${EXPECTED_WEB_PLATFORM:-amplify}"

failures=0

pass() {
  printf 'PASS %s\n' "$1"
}

warn() {
  printf 'WARN %s\n' "$1"
}

fail() {
  printf 'FAIL %s\n' "$1"
  failures=$((failures + 1))
}

require_file() {
  local path="$1"
  local message="$2"
  if [[ -f "${path}" ]]; then
    pass "${message}"
  else
    fail "${message} (${path} missing)"
  fi
}

echo "Deployment pathway audit"
echo "repo: $(basename "$(pwd)")"
echo

origin_remote="$(git remote get-url origin 2>/dev/null || true)"
if [[ -z "${origin_remote}" ]]; then
  fail "Git remote origin is not configured"
elif [[ "${origin_remote}" == "${expected_remote}" ]]; then
  pass "Git remote origin matches ${expected_remote}"
else
  fail "Git remote origin points at ${origin_remote}, expected ${expected_remote}"
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
pass "Current branch is ${current_branch}"

if git diff --quiet && git diff --cached --quiet; then
  pass "Working tree is clean"
else
  warn "Working tree has uncommitted changes"
fi

if [[ "${expected_web_platform}" == "amplify" ]]; then
  require_file ".npmrc" "pnpm monorepo config for Amplify is present"
  if [[ -f ".npmrc" ]] && grep -q '^node-linker=hoisted$' .npmrc; then
    pass ".npmrc config uses hoisted node linker for Amplify builds"
  else
    fail ".npmrc must set node-linker=hoisted for Amplify pnpm monorepo builds"
  fi

  require_file "amplify.yml" "Amplify monorepo build spec is present"
  if [[ -f "amplify.yml" ]] && grep -q 'appRoot: apps/web' amplify.yml; then
    pass "Amplify build spec targets apps/web"
  else
    fail "Amplify build spec must target apps/web"
  fi

  if [[ -f "apps/web/.vercel/project.json" ]]; then
    warn "apps/web/.vercel/project.json still exists; keep it only if Vercel remains a temporary fallback"
  else
    pass "apps/web Vercel link is absent"
  fi
else
  warn "EXPECTED_WEB_PLATFORM is ${expected_web_platform}; Amplify-specific checks were skipped"
fi

if [[ -e ".vercel" ]]; then
  warn "repo-root .vercel directory exists"
else
  pass "repo-root .vercel directory is absent"
fi

if [[ -e "apps/validation-web/.vercel" ]]; then
  fail "apps/validation-web/.vercel should not exist"
else
  pass "stale apps/validation-web Vercel link is absent"
fi

require_file "deploy-web-vm.sh" "Legacy fallback web VM deploy script is present"
require_file "deploy/vm/install-web-deploy-wrapper.sh" "Legacy VM web deploy wrapper installer is present"
require_file "deploy-validation-worker.sh" "Validation worker Cloud Run deploy script is present"
require_file ".github/workflows/accessibility-validation.yml" "GitHub Actions validation workflow is present"
require_file ".github/workflows/web-vm-deploy.yml" "Legacy GitHub Actions web VM deploy workflow is present"
require_file ".github/workflows/validation-aws-deploy.yml" "GitHub Actions AWS validation deploy workflow is present"
require_file "infra/aws/validation/main.tf" "AWS validation Terraform stack is present"
require_file "docs/validation-aws-cutover-runbook.md" "AWS validation cutover runbook is present"

if command -v gcloud >/dev/null 2>&1; then
  active_account="$(gcloud config get-value account 2>/dev/null || true)"
  active_project="$(gcloud config get-value project 2>/dev/null || true)"

  if [[ -n "${active_account}" && "${active_account}" != "(unset)" ]]; then
    pass "gcloud active account is ${active_account}"
  else
    warn "gcloud active account is not set"
  fi

  if [[ -n "${active_project}" && "${active_project}" != "(unset)" ]]; then
    pass "gcloud active project is ${active_project}"
  else
    warn "gcloud active project is not set"
  fi
else
  warn "gcloud CLI is not installed in this shell"
fi

if [[ "${SKIP_LIVE_DEPLOY_CHECK:-0}" == "1" ]]; then
  warn "Skipping live deployment state audit because SKIP_LIVE_DEPLOY_CHECK=1"
else
  if command -v pnpm >/dev/null 2>&1; then
    if pnpm exec tsx ./scripts/check-live-deployment-state.ts; then
      pass "Live deployment state audit passed"
    else
      fail "Live deployment state audit failed"
    fi
  else
    warn "pnpm is not installed; skipping live deployment state audit"
  fi
fi

echo
if (( failures > 0 )); then
  echo "Deployment pathway audit failed with ${failures} issue(s)."
  exit 1
fi

echo "Deployment pathway audit passed."
