#!/usr/bin/env bash
set -euo pipefail

topology_file="config/deployment-topology.json"

read_topology_value() {
  local key="$1"
  if [[ -f "${topology_file}" ]]; then
    node -e '
      const fs = require("node:fs");
      const [file, key] = process.argv.slice(1);
      const payload = JSON.parse(fs.readFileSync(file, "utf8"));
      const value = payload[key];
      if (typeof value === "string" && value.length > 0) {
        process.stdout.write(value);
      }
    ' "${topology_file}" "${key}" 2>/dev/null || true
  fi
}

expected_remote="${EXPECTED_GIT_REMOTE:-git@github.com:ergoveritas1-alt/certscore.ai.git}"
expected_web_platform="${EXPECTED_WEB_PLATFORM:-$(read_topology_value preferredWebPlatform)}"
expected_web_platform="${expected_web_platform:-amplify}"
accepted_aws_runtime="${ACCEPTED_AWS_RUNTIME:-$(read_topology_value acceptedAwsRuntime)}"
expected_live_runtime_target="${EXPECTED_LIVE_RUNTIME_TARGET:-$(read_topology_value currentLiveWebRuntimeTarget)}"
expected_secondary_runtime_target="${EXPECTED_SECONDARY_RUNTIME_TARGET:-}"
live_base_url="${LIVE_BASE_URL:-$(read_topology_value primaryHost)}"
secondary_base_url="${SECONDARY_BASE_URL:-$(read_topology_value secondaryHost)}"

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

if [[ "${expected_web_platform}" == "ecs-fargate" ]]; then
  require_file ".github/workflows/web-aws-ecs-deploy.yml" "GitHub Actions public web ECS deploy workflow is present"
  require_file "apps/web/Dockerfile" "Public web ECS image build file is present"
elif [[ "${expected_web_platform}" == "amplify" ]]; then
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

else
  warn "EXPECTED_WEB_PLATFORM is ${expected_web_platform}; Amplify-specific checks were skipped"
fi

if [[ "${accepted_aws_runtime}" == "ecs-fargate" ]]; then
  require_file "infra/aws/web-ecs/README.md" "ECS/Fargate web infrastructure scaffold is present"
  require_file "infra/aws/web-ecs/variables.tf" "ECS/Fargate web infrastructure variables are present"
  require_file "infra/aws/web-ecs/terraform.tfvars.example" "ECS/Fargate web infrastructure example vars are present"
  require_file "docs/aws-web-ecs-cutover-plan.md" "ECS/Fargate web cutover runbook is present"
elif [[ "${accepted_aws_runtime}" == "app-runner" ]]; then
  require_file "infra/aws/web-apprunner/README.md" "Accepted AWS runtime scaffold for App Runner is present"
  require_file "docs/aws-web-apprunner-cutover-plan.md" "Accepted AWS runtime runbook for App Runner is present"
elif [[ "${accepted_aws_runtime}" == "amplify" ]]; then
  pass "Accepted AWS runtime is Amplify"
elif [[ -n "${accepted_aws_runtime}" ]]; then
  warn "ACCEPTED_AWS_RUNTIME is ${accepted_aws_runtime}; runtime-specific AWS checks were skipped"
fi

require_file ".github/workflows/accessibility-validation.yml" "GitHub Actions validation workflow is present"
require_file ".github/workflows/validation-aws-deploy.yml" "GitHub Actions AWS validation deploy workflow is present"
require_file "infra/aws/validation/main.tf" "AWS validation Terraform stack is present"
require_file "docs/validation-aws-cutover-runbook.md" "AWS validation cutover runbook is present"
require_file "${topology_file}" "Deployment topology source of truth is present"

if command -v pnpm >/dev/null 2>&1; then
  if pnpm exec tsx ./scripts/check-deployment-topology.ts; then
    pass "Deployment topology config is valid"
  else
    fail "Deployment topology config is invalid"
  fi
else
  warn "pnpm is not installed; skipping deployment topology validation"
fi

if [[ "${SKIP_LIVE_DEPLOY_CHECK:-0}" == "1" ]]; then
  warn "Skipping live deployment state audit because SKIP_LIVE_DEPLOY_CHECK=1"
else
  if command -v pnpm >/dev/null 2>&1; then
    live_env=()

    if [[ -n "${expected_live_runtime_target}" ]]; then
      live_env+=("EXPECTED_LIVE_RUNTIME_TARGET=${expected_live_runtime_target}")
    fi

    if [[ -n "${expected_secondary_runtime_target}" ]]; then
      live_env+=("EXPECTED_SECONDARY_RUNTIME_TARGET=${expected_secondary_runtime_target}")
    fi

    if [[ -n "${live_base_url}" ]]; then
      live_env+=("LIVE_BASE_URL=${live_base_url}")
    fi

    if [[ -n "${secondary_base_url}" ]]; then
      live_env+=("SECONDARY_BASE_URL=${secondary_base_url}")
    fi

    if env "${live_env[@]}" pnpm exec tsx ./scripts/check-live-deployment-state.ts; then
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
