#!/usr/bin/env bash
set -euo pipefail

check_name="${CHECK_NAME:-ecs-service}"
cluster="${ECS_CLUSTER_NAME:-}"
service="${ECS_SERVICE_NAME:-}"
container_name="${ECS_CONTAINER_NAME:-}"
ecr_repository="${ECR_REPOSITORY:-}"
expected_sha="${EXPECTED_GIT_SHA:-${GITHUB_SHA:-}}"
log_group="${ECS_LOG_GROUP:-}"
heartbeat_pattern="${ECS_HEALTH_LOG_PATTERN:-started|startup|heartbeat}"
require_log_heartbeat="${ECS_HEALTH_REQUIRE_LOG_HEARTBEAT:-1}"

fail() { echo "FAIL ${check_name}: $*" >&2; exit 1; }
pass() { echo "PASS ${check_name}: $*"; }

[[ -n "${cluster}" ]] || fail "set ECS_CLUSTER_NAME"
[[ -n "${service}" ]] || fail "set ECS_SERVICE_NAME"
[[ "${service}" != *scanner* ]] || fail "scanner ECS services are prohibited; production scanning is v2 DAG Lambda only"

service_json="$(aws ecs describe-services --cluster "${cluster}" --services "${service}")"
[[ "$(jq '.services | length' <<<"${service_json}")" == "1" ]] || fail "service not found"
[[ "$(jq -r '.services[0].runningCount' <<<"${service_json}")" != "0" ]] || fail "service has no running tasks"

task_definition="$(jq -r '.services[0].taskDefinition' <<<"${service_json}")"
task_arn="$(aws ecs list-tasks --cluster "${cluster}" --service-name "${service}" --desired-status RUNNING | jq -r '.taskArns[0] // empty')"
[[ -n "${task_arn}" ]] || fail "service has no running task"
task_json="$(aws ecs describe-tasks --cluster "${cluster}" --tasks "${task_arn}")"
task_def_json="$(aws ecs describe-task-definition --task-definition "${task_definition}")"

if [[ -z "${container_name}" ]]; then
  container_name="$(jq -r '.taskDefinition.containerDefinitions[0].name' <<<"${task_def_json}")"
fi
running_digest="$(jq -r --arg name "${container_name}" '.tasks[0].containers[] | select(.name == $name) | .imageDigest // empty' <<<"${task_json}" | head -n 1)"
[[ -n "${running_digest}" ]] || fail "running task has no image digest"

if [[ -n "${ecr_repository}" && -n "${expected_sha}" ]]; then
  expected_digest="$(aws ecr describe-images --repository-name "${ecr_repository}" --image-ids imageTag="${expected_sha}" | jq -r '.imageDetails[0].imageDigest // empty')"
  [[ "${running_digest}" == "${expected_digest}" ]] || fail "running digest does not match ${ecr_repository}:${expected_sha}"
fi
pass "running task is healthy and image digest is current"

if [[ -n "${log_group}" ]]; then
  start_time_ms="$(( ($(date +%s) - 600) * 1000 ))"
  log_events="$(aws logs filter-log-events --log-group-name "${log_group}" --start-time "${start_time_ms}" --limit 200 --query 'events[].message' --output text)"
  if grep -Eiq "${heartbeat_pattern}" <<<"${log_events}"; then
    pass "recent startup/heartbeat log found"
  elif [[ "${require_log_heartbeat}" == "1" ]]; then
    fail "no recent startup/heartbeat log found"
  fi
fi
