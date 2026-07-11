#!/usr/bin/env bash
set -euo pipefail

region="${AWS_REGION:-eu-central-1}"
prefix="${CERTSCORE_V2_DAG_LAMBDA_DEV_PREFIX:-certscore-v2-dag-local}"
function_name="${CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME:-${prefix}-lambda}"
queue_name="${CERTSCORE_V2_DAG_LAMBDA_QUEUE_NAME:-${prefix}-results}"
failure_queue_name="${CERTSCORE_V2_DAG_LAMBDA_FAILURE_QUEUE_NAME:-${prefix}-async-failures}"
role_name="${CERTSCORE_V2_DAG_LAMBDA_ROLE_NAME:-${prefix}-role}"
zip_path="${CERTSCORE_V2_DAG_LAMBDA_ZIP:-${1:-}}"

case "$region" in
  eu-central-1) location_env_prefix="EU_DE" ;;
  eu-west-1) location_env_prefix="EU_IE" ;;
  us-west-2) location_env_prefix="US_WEST" ;;
  *)
    echo "Unsupported local v2 DAG Lambda region: ${region}. Use eu-central-1, eu-west-1, or us-west-2." >&2
    exit 1
    ;;
esac

if [[ -z "$zip_path" || ! -f "$zip_path" ]]; then
  cat >&2 <<EOF
Provide a built Lambda zip path as the first argument or CERTSCORE_V2_DAG_LAMBDA_ZIP.

This script creates/updates dev/local AWS resources only:
  region: ${region}
  function: ${function_name}
  queue: ${queue_name}
  role: ${role_name}

Packaging the v2 DAG runtime, Playwright browser assets, and dependencies is intentionally
kept separate from resource creation.
EOF
  exit 1
fi

account_id="$(aws sts get-caller-identity --query Account --output text)"
queue_url="$(aws sqs create-queue \
  --region "$region" \
  --queue-name "$queue_name" \
  --attributes VisibilityTimeout=900,MessageRetentionPeriod=1209600 \
  --query QueueUrl \
  --output text)"
queue_arn="$(aws sqs get-queue-attributes \
  --region "$region" \
  --queue-url "$queue_url" \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)"
failure_queue_url="$(aws sqs create-queue \
  --region "$region" \
  --queue-name "$failure_queue_name" \
  --attributes VisibilityTimeout=60,MessageRetentionPeriod=1209600 \
  --query QueueUrl \
  --output text)"
failure_queue_arn="$(aws sqs get-queue-attributes \
  --region "$region" \
  --queue-url "$failure_queue_url" \
  --attribute-names QueueArn \
  --query 'Attributes.QueueArn' \
  --output text)"

trust_policy="$(mktemp)"
permission_policy="$(mktemp)"
trap 'rm -f "$trust_policy" "$permission_policy"' EXIT

cat >"$trust_policy" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON

cat >"$permission_policy" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:${region}:${account_id}:*"
    },
    {
      "Effect": "Allow",
      "Action": "sqs:SendMessage",
      "Resource": ["${queue_arn}", "${failure_queue_arn}"]
    }
  ]
}
JSON

if ! aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
  aws iam create-role \
    --role-name "$role_name" \
    --assume-role-policy-document "file://${trust_policy}" >/dev/null
else
  aws iam update-assume-role-policy \
    --role-name "$role_name" \
    --policy-document "file://${trust_policy}" >/dev/null
fi

aws iam put-role-policy \
  --role-name "$role_name" \
  --policy-name "${prefix}-policy" \
  --policy-document "file://${permission_policy}" >/dev/null

role_arn="$(aws iam get-role --role-name "$role_name" --query 'Role.Arn' --output text)"
sleep 10

if aws lambda get-function --region "$region" --function-name "$function_name" >/dev/null 2>&1; then
  aws lambda update-function-code \
    --region "$region" \
    --function-name "$function_name" \
    --zip-file "fileb://${zip_path}" >/dev/null
  aws lambda update-function-configuration \
    --region "$region" \
    --function-name "$function_name" \
    --role "$role_arn" \
    --handler "src/handler.handler" \
    --runtime "nodejs22.x" \
    --timeout 900 \
    --memory-size 2048 \
    --environment "Variables={CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV=local}" >/dev/null
else
  aws lambda create-function \
    --region "$region" \
    --function-name "$function_name" \
    --role "$role_arn" \
    --handler "src/handler.handler" \
    --runtime "nodejs22.x" \
    --timeout 900 \
    --memory-size 2048 \
    --zip-file "fileb://${zip_path}" \
    --environment "Variables={CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV=local}" >/dev/null
fi

aws lambda put-function-event-invoke-config \
  --region "$region" \
  --function-name "$function_name" \
  --maximum-event-age-in-seconds 60 \
  --maximum-retry-attempts 0 \
  --destination-config "OnFailure={Destination=${failure_queue_arn}}" >/dev/null

cat <<EOF
Created/updated local v2 DAG Lambda resources:
  AWS_REGION=${region}
  CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME=${function_name}
  CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL=${queue_url}
  CERTSCORE_V2_DAG_LAMBDA_${location_env_prefix}_ENABLED=true
  CERTSCORE_V2_DAG_LAMBDA_${location_env_prefix}_FUNCTION_NAME=${function_name}
  CERTSCORE_V2_DAG_LAMBDA_${location_env_prefix}_RESULT_QUEUE_URL=${queue_url}
  CERTSCORE_V2_DAG_LAMBDA_ASYNC_FAILURE_QUEUE_URL=${failure_queue_url}
  CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV=local
EOF
