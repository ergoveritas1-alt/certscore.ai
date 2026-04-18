#!/usr/bin/env bash
set -euo pipefail

expected_remote="${EXPECTED_GIT_REMOTE:-git@github.com:ergoveritas1-alt/certscore.ai.git}"
expected_vercel_project="${EXPECTED_VERCEL_PROJECT:-consentcheck-site}"
expected_vercel_root="${EXPECTED_VERCEL_ROOT:-apps/web}"
expected_vercel_team="${EXPECTED_VERCEL_TEAM_ID:-team_jNJ5Ez1995VpbyUeFMqhF5jo}"

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

if [[ -f "apps/web/.vercel/project.json" ]]; then
  project_name="$(node -p "require('./apps/web/.vercel/project.json').projectName || ''")"
  project_id="$(node -p "require('./apps/web/.vercel/project.json').projectId || ''")"
  org_id="$(node -p "require('./apps/web/.vercel/project.json').orgId || ''")"
  root_dir="$(node -p "((require('./apps/web/.vercel/project.json').settings || {}).rootDirectory) || ''")"

  if [[ "${project_name}" == "${expected_vercel_project}" ]]; then
    pass "apps/web Vercel link targets ${expected_vercel_project}"
  else
    fail "apps/web Vercel link targets ${project_name:-<empty>}, expected ${expected_vercel_project}"
  fi

  if [[ "${org_id}" == "${expected_vercel_team}" ]]; then
    pass "apps/web Vercel link uses team ${expected_vercel_team}"
  else
    fail "apps/web Vercel link uses team ${org_id:-<empty>}, expected ${expected_vercel_team}"
  fi

  if [[ "${root_dir}" == "${expected_vercel_root}" ]]; then
    pass "apps/web Vercel rootDirectory is ${expected_vercel_root}"
  else
    fail "apps/web Vercel rootDirectory is ${root_dir:-<empty>}, expected ${expected_vercel_root}"
  fi

  if [[ -n "${project_id}" ]]; then
    pass "apps/web Vercel project id is present (${project_id})"
  else
    fail "apps/web Vercel project id is missing"
  fi
else
  fail "apps/web/.vercel/project.json is missing"
fi

if [[ -e ".vercel" ]]; then
  fail "repo-root .vercel directory should not exist"
else
  pass "repo-root .vercel directory is absent"
fi

if [[ -e "apps/validation-web/.vercel" ]]; then
  fail "apps/validation-web/.vercel should not exist"
else
  pass "stale apps/validation-web Vercel link is absent"
fi

require_file "deploy-web-vm.sh" "Fallback web VM deploy script is present"
require_file "deploy-validation-worker.sh" "Validation worker Cloud Run deploy script is present"
require_file ".github/workflows/accessibility-validation.yml" "GitHub Actions validation workflow is present"

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

echo
if (( failures > 0 )); then
  echo "Deployment pathway audit failed with ${failures} issue(s)."
  exit 1
fi

echo "Deployment pathway audit passed."
