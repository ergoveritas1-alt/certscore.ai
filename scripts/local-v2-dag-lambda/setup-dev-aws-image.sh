#!/usr/bin/env bash
set -euo pipefail

region="${AWS_REGION:-us-west-1}"
prefix="${CERTSCORE_V2_DAG_LAMBDA_DEV_PREFIX:-certscore-v2-dag-local}"
function_name="${CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME:-${prefix}-lambda}"
queue_name="${CERTSCORE_V2_DAG_LAMBDA_QUEUE_NAME:-${prefix}-results}"
role_name="${CERTSCORE_V2_DAG_LAMBDA_ROLE_NAME:-${prefix}-role}"
image_uri="${CERTSCORE_V2_DAG_LAMBDA_IMAGE_URI:-${1:-}}"

if [[ "$region" != "us-west-1" ]]; then
  echo "Refusing to create local v2 DAG Lambda resources outside us-west-1." >&2
  exit 1
fi

if [[ -z "$image_uri" ]]; then
  cat >&2 <<EOF
Provide an image URI as the first argument or CERTSCORE_V2_DAG_LAMBDA_IMAGE_URI.

This script creates/updates dev/local AWS resources only:
  region: ${region}
  function: ${function_name}
  queue: ${queue_name}
  role: ${role_name}
EOF
  exit 1
fi

if [[ "$function_name" != *local* && "$function_name" != *dev* ]]; then
  echo "Refusing non-dev/local Lambda function name: ${function_name}" >&2
  exit 1
fi

if [[ "$queue_name" != *local* && "$queue_name" != *dev* ]]; then
  echo "Refusing non-dev/local SQS queue name: ${queue_name}" >&2
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
      "Resource": "${queue_arn}"
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
  package_type="$(aws lambda get-function-configuration \
    --region "$region" \
    --function-name "$function_name" \
    --query PackageType \
    --output text)"
  if [[ "$package_type" != "Image" ]]; then
    echo "Refusing to mutate non-image Lambda function ${function_name}. Delete/recreate manually if this is the old zip dev function." >&2
    exit 1
  fi
  aws lambda update-function-code \
    --region "$region" \
    --function-name "$function_name" \
    --image-uri "$image_uri" >/dev/null
  aws lambda wait function-updated --region "$region" --function-name "$function_name"
  aws lambda update-function-configuration \
    --region "$region" \
    --function-name "$function_name" \
    --role "$role_arn" \
    --timeout 900 \
    --memory-size 2048 \
    --environment "Variables={CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV=local,PLAYWRIGHT_BROWSERS_PATH=/ms-playwright,CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR=/tmp/certscore-v2-dag-lambda}" >/dev/null
else
  aws lambda create-function \
    --region "$region" \
    --function-name "$function_name" \
    --role "$role_arn" \
    --package-type Image \
    --code "ImageUri=${image_uri}" \
    --timeout 900 \
    --memory-size 2048 \
    --environment "Variables={CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV=local,PLAYWRIGHT_BROWSERS_PATH=/ms-playwright,CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR=/tmp/certscore-v2-dag-lambda}" >/dev/null
fi

cat <<EOF
Created/updated local v2 DAG Lambda image resources:
  AWS_REGION=${region}
  CERTSCORE_V2_DAG_LAMBDA_ENABLED=true
  CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME=${function_name}
  CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL=${queue_url}
  CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV=local
EOF
