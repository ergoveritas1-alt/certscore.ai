#!/usr/bin/env bash
set -euo pipefail

check_name="${CHECK_NAME:-scanner}"
cluster="${AWS_SCANNER_ECS_CLUSTER:-${ECS_CLUSTER_NAME:-}}"
service="${AWS_SCANNER_ECS_SERVICE:-${ECS_SERVICE_NAME:-}}"
container_name="${AWS_SCANNER_CONTAINER_NAME:-${ECS_CONTAINER_NAME:-}}"
ecr_repository="${AWS_SCANNER_ECR_REPOSITORY:-${ECR_REPOSITORY:-}}"
expected_sha="${EXPECTED_GIT_SHA:-${GITHUB_SHA:-}}"
log_group="${AWS_SCANNER_LOG_GROUP:-${ECS_LOG_GROUP:-}}"
log_window_minutes="${SCANNER_HEALTH_LOG_WINDOW_MINUTES:-10}"
heartbeat_pattern="${SCANNER_HEALTH_LOG_PATTERN:-started|startup|heartbeat|runtime_heartbeat}"

fail() {
  echo "FAIL ${check_name}: $*" >&2
  exit 1
}

pass() {
  echo "PASS ${check_name}: $*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

require_command aws
require_command jq

if [[ -z "${cluster}" ]]; then
  fail "set AWS_SCANNER_ECS_CLUSTER or ECS_CLUSTER_NAME"
fi

if [[ -z "${service}" ]]; then
  fail "set AWS_SCANNER_ECS_SERVICE or ECS_SERVICE_NAME"
fi

if [[ -z "${expected_sha}" ]]; then
  expected_sha="$(git rev-parse origin/main 2>/dev/null || git rev-parse HEAD 2>/dev/null || true)"
fi

if [[ -z "${expected_sha}" ]]; then
  fail "set EXPECTED_GIT_SHA or run inside a git checkout"
fi

service_json="$(aws ecs describe-services --cluster "${cluster}" --services "${service}")"
service_count="$(jq '.services | length' <<<"${service_json}")"
if [[ "${service_count}" != "1" ]]; then
  fail "ECS service was not found in cluster ${cluster}: ${service}"
fi

desired_count="$(jq -r '.services[0].desiredCount' <<<"${service_json}")"
running_count="$(jq -r '.services[0].runningCount' <<<"${service_json}")"
task_definition_arn="$(jq -r '.services[0].taskDefinition' <<<"${service_json}")"

if [[ "${desired_count}" == "0" ]]; then
  fail "ECS service desiredCount is 0"
fi

if [[ "${running_count}" == "0" ]]; then
  fail "ECS service has no running tasks"
fi

task_arns="$(aws ecs list-tasks --cluster "${cluster}" --service-name "${service}" --desired-status RUNNING | jq -r '.taskArns[]')"
if [[ -z "${task_arns}" ]]; then
  fail "ECS service has no RUNNING task ARNs"
fi

first_task_arn="$(head -n 1 <<<"${task_arns}")"
task_json="$(aws ecs describe-tasks --cluster "${cluster}" --tasks "${first_task_arn}")"
task_status="$(jq -r '.tasks[0].lastStatus' <<<"${task_json}")"
if [[ "${task_status}" != "RUNNING" ]]; then
  fail "latest inspected ECS task is ${task_status}, expected RUNNING"
fi

task_def_json="$(aws ecs describe-task-definition --task-definition "${task_definition_arn}")"

if [[ -z "${container_name}" ]]; then
  container_name="$(jq -r '.taskDefinition.containerDefinitions[0].name' <<<"${task_def_json}")"
fi

container_image="$(jq -r --arg name "${container_name}" '.taskDefinition.containerDefinitions[] | select(.name == $name) | .image' <<<"${task_def_json}" | head -n 1)"
if [[ -z "${container_image}" ]]; then
  fail "container ${container_name} was not found in task definition ${task_definition_arn}"
fi

running_digest="$(jq -r --arg name "${container_name}" '.tasks[0].containers[] | select(.name == $name) | .imageDigest // empty' <<<"${task_json}" | head -n 1)"
if [[ -z "${running_digest}" ]]; then
  fail "running task does not expose an imageDigest for container ${container_name}"
fi

if [[ -z "${ecr_repository}" ]]; then
  image_without_registry="${container_image#*/}"
  ecr_repository="${image_without_registry%%:*}"
fi

expected_digest="$(aws ecr describe-images --repository-name "${ecr_repository}" --image-ids imageTag="${expected_sha}" | jq -r '.imageDetails[0].imageDigest // empty')"
if [[ -z "${expected_digest}" ]]; then
  fail "ECR repository ${ecr_repository} does not have image tag ${expected_sha}"
fi

if [[ "${running_digest}" != "${expected_digest}" ]]; then
  fail "running task digest ${running_digest} does not match ${ecr_repository}:${expected_sha} digest ${expected_digest}"
fi

pass "running task image digest matches ${ecr_repository}:${expected_sha}"

if [[ -z "${log_group}" ]]; then
  log_group="$(jq -r --arg name "${container_name}" '.taskDefinition.containerDefinitions[] | select(.name == $name) | .logConfiguration.options["awslogs-group"] // empty' <<<"${task_def_json}" | head -n 1)"
fi

if [[ -z "${log_group}" ]]; then
  fail "set AWS_SCANNER_LOG_GROUP or configure awslogs-group on container ${container_name}"
fi

task_id="${first_task_arn##*/}"
start_time_ms="$(( ($(date +%s) - (log_window_minutes * 60)) * 1000 ))"
log_events="$(aws logs filter-log-events \
  --log-group-name "${log_group}" \
  --start-time "${start_time_ms}" \
  --interleaved \
  --limit 200 \
  --query 'events[].message' \
  --output text)"

if ! grep -Eiq "${heartbeat_pattern}" <<<"${log_events}"; then
  fail "no startup/heartbeat log matching /${heartbeat_pattern}/ in ${log_group} during the last ${log_window_minutes} minute(s) for task ${task_id}"
fi

pass "recent startup/heartbeat log found in ${log_group}"
