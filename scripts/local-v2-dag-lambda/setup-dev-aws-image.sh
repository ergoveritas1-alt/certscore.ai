#!/usr/bin/env bash
set -euo pipefail

region="${AWS_REGION:-eu-central-1}"
prefix="${CERTSCORE_V2_DAG_LAMBDA_DEV_PREFIX:-certscore-v2-dag-local}"
function_name="${CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME:-${prefix}-lambda}"
queue_name="${CERTSCORE_V2_DAG_LAMBDA_QUEUE_NAME:-${prefix}-results}"
role_name="${CERTSCORE_V2_DAG_LAMBDA_ROLE_NAME:-${prefix}-role}"
image_uri="${CERTSCORE_V2_DAG_LAMBDA_IMAGE_URI:-${1:-}}"
artifact_bucket="${CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET:-${prefix}-artifacts-${AWS_ACCOUNT_ID:-}}"
artifact_prefix="${CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX:-v2-dag-lambda/local}"
memory_size="${CERTSCORE_V2_DAG_LAMBDA_MEMORY_SIZE:-2048}"

case "$region" in
  eu-central-1) location_env_prefix="EU_DE" ;;
  eu-west-1) location_env_prefix="EU_IE" ;;
  us-west-2) location_env_prefix="US_WEST" ;;
  *)
    echo "Unsupported local v2 DAG Lambda region: ${region}. Use eu-central-1, eu-west-1, or us-west-2." >&2
    exit 1
    ;;
esac

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

if ! [[ "$memory_size" =~ ^[0-9]+$ ]] || (( memory_size < 512 || memory_size > 10240 )); then
  echo "CERTSCORE_V2_DAG_LAMBDA_MEMORY_SIZE must be an integer between 512 and 10240 MB for the current local/dev Lambda target." >&2
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
if [[ "$artifact_bucket" == *- ]]; then
  artifact_bucket="${prefix}-artifacts-${account_id}"
fi
if [[ "$artifact_bucket" != *local* && "$artifact_bucket" != *dev* ]]; then
  echo "Refusing non-dev/local artifact bucket name: ${artifact_bucket}" >&2
  exit 1
fi

if ! aws s3api head-bucket --bucket "$artifact_bucket" >/dev/null 2>&1; then
  aws s3api create-bucket \
    --region "$region" \
    --bucket "$artifact_bucket" \
    --create-bucket-configuration "LocationConstraint=${region}" >/dev/null
fi
aws s3api put-public-access-block \
  --bucket "$artifact_bucket" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true >/dev/null

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
environment_json="$(mktemp)"
existing_environment_json="$(mktemp)"
trap 'rm -f "$trust_policy" "$permission_policy" "$environment_json" "$existing_environment_json"' EXIT

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
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::${artifact_bucket}/${artifact_prefix%/}/*"
    },
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:${region}:${account_id}:function:${prefix}-*"
    }
  ]
}
JSON

if aws lambda get-function-configuration --region "$region" --function-name "$function_name" >/dev/null 2>&1; then
  aws lambda get-function-configuration \
    --region "$region" \
    --function-name "$function_name" \
    --query 'Environment.Variables' \
    --output json >"$existing_environment_json"
else
  printf '{}\n' >"$existing_environment_json"
fi

EXISTING_ENVIRONMENT_JSON="$existing_environment_json" \
CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET="$artifact_bucket" \
CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX="$artifact_prefix" \
node >"$environment_json" <<'NODE'
const { readFileSync } = require("node:fs");
const existing = JSON.parse(readFileSync(process.env.EXISTING_ENVIRONMENT_JSON, "utf8"));
const variables = {
  CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR: "/tmp/certscore-v2-dag-lambda",
  CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET: process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET,
  CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX: process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX,
  CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local",
  PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright"
};

for (const key of [
  "CERTSCORE_V2_DAG_LAMBDA_ACTION_FINAL_SETTLE_MS",
  "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS",
  "CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE",
  "CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE",
  "CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE",
  "CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE",
  "CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS",
  "CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY",
  "CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE"
]) {
  if (process.env[key] && String(process.env[key]).trim()) {
    variables[key] = String(process.env[key]).trim();
  } else if (existing[key] && String(existing[key]).trim()) {
    variables[key] = String(existing[key]).trim();
  }
}

if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
  variables.OPENAI_API_KEY = process.env.OPENAI_API_KEY.trim();
} else if (existing.OPENAI_API_KEY && String(existing.OPENAI_API_KEY).trim()) {
  variables.OPENAI_API_KEY = String(existing.OPENAI_API_KEY).trim();
}

process.stdout.write(`${JSON.stringify({ Variables: variables })}\n`);
NODE

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
    --memory-size "$memory_size" \
    --environment "file://${environment_json}" >/dev/null
else
  aws lambda create-function \
    --region "$region" \
    --function-name "$function_name" \
    --role "$role_arn" \
    --package-type Image \
    --code "ImageUri=${image_uri}" \
    --timeout 900 \
    --memory-size "$memory_size" \
    --environment "file://${environment_json}" >/dev/null
fi

cat <<EOF
Created/updated local v2 DAG Lambda image resources:
  AWS_REGION=${region}
  CERTSCORE_V2_DAG_LAMBDA_ENABLED=true
  CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME=${function_name}
  CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL=${queue_url}
  CERTSCORE_V2_DAG_LAMBDA_${location_env_prefix}_ENABLED=true
  CERTSCORE_V2_DAG_LAMBDA_${location_env_prefix}_FUNCTION_NAME=${function_name}
  CERTSCORE_V2_DAG_LAMBDA_${location_env_prefix}_RESULT_QUEUE_URL=${queue_url}
  CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV=local
  CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET=${artifact_bucket}
  CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX=${artifact_prefix}
  CERTSCORE_V2_DAG_LAMBDA_MEMORY_SIZE=${memory_size}
EOF
