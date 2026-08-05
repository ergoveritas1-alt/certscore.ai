#!/usr/bin/env bash
set -euo pipefail

region="${AWS_REGION:-eu-central-1}"
prefix="${CERTSCORE_V2_DAG_LAMBDA_DEV_PREFIX:-certscore-v2-dag-local}"
function_name="${CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME:-${prefix}-lambda}"
queue_name="${CERTSCORE_V2_DAG_LAMBDA_QUEUE_NAME:-${prefix}-results}"
failure_queue_name="${CERTSCORE_V2_DAG_LAMBDA_FAILURE_QUEUE_NAME:-${prefix}-async-failures}"
role_name="${CERTSCORE_V2_DAG_LAMBDA_ROLE_NAME:-${prefix}-role}"
image_uri="${CERTSCORE_V2_DAG_LAMBDA_IMAGE_URI:-${1:-}}"
artifact_bucket="${CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET:-}"
artifact_prefix="${CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX:-v2-dag-lambda/local}"
memory_size="${CERTSCORE_V2_DAG_LAMBDA_MEMORY_SIZE:-4096}"

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
if [[ -z "$artifact_bucket" ]]; then
  artifact_bucket="${prefix}-artifacts-${region}-${account_id}"
elif [[ "$artifact_bucket" == *- ]]; then
  artifact_bucket="${prefix}-artifacts-${region}-${account_id}"
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
supported_regions=("eu-central-1" "eu-west-1" "us-west-2")

json_array() {
  node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' "$@"
}

log_resources=()
sqs_resources=()
s3_resources=()
lambda_resources=()
for supported_region in "${supported_regions[@]}"; do
  log_resources+=("arn:aws:logs:${supported_region}:${account_id}:*")
  sqs_resources+=("arn:aws:sqs:${supported_region}:${account_id}:${queue_name}")
  sqs_resources+=("arn:aws:sqs:${supported_region}:${account_id}:${prefix}-production-results")
  sqs_resources+=("arn:aws:sqs:${supported_region}:${account_id}:${failure_queue_name}")
  s3_resources+=("arn:aws:s3:::${prefix}-artifacts-${supported_region}-${account_id}/${artifact_prefix%/}/*")
  lambda_resources+=("arn:aws:lambda:${supported_region}:${account_id}:function:${prefix}-*")
done
s3_resources+=("arn:aws:s3:::${artifact_bucket}/${artifact_prefix%/}/*")
log_resources_json="$(json_array "${log_resources[@]}")"
sqs_resources_json="$(json_array "${sqs_resources[@]}")"
s3_resources_json="$(json_array "${s3_resources[@]}")"
lambda_resources_json="$(json_array "${lambda_resources[@]}")"

trust_policy="$(mktemp)"
permission_policy="$(mktemp)"
environment_json="$(mktemp)"
existing_environment_json="$(mktemp)"
regional_browser_config="$(mktemp)"
trap 'rm -f "$trust_policy" "$permission_policy" "$environment_json" "$existing_environment_json" "$regional_browser_config"' EXIT

image_repository_with_tag="${image_uri#*/}"
image_repository="${image_repository_with_tag%:*}"
image_tag="${image_repository_with_tag##*:}"
image_digest="$(aws ecr describe-images \
  --region "$region" \
  --repository-name "$image_repository" \
  --image-ids "imageTag=${image_tag}" \
  --query 'imageDetails[0].imageDigest' \
  --output text)"
if ! [[ "$image_digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "Could not resolve a bounded image digest for ${image_uri}." >&2
  exit 1
fi

if aws lambda get-function-configuration --region "$region" --function-name "$function_name" >/dev/null 2>&1; then
  aws lambda get-function-configuration \
    --region "$region" \
    --function-name "$function_name" \
    --query 'Environment.Variables' \
    --output json >"$existing_environment_json"
else
  printf '{}\n' >"$existing_environment_json"
fi

vpc_mode="none"
egress_id="aws-default:${region}"
egress_provider="aws-default"
egress_public_ip_hash=""
if aws lambda get-function-configuration --region "$region" --function-name "$function_name" >/dev/null 2>&1; then
  existing_vpc_id="$(aws lambda get-function-configuration \
    --region "$region" \
    --function-name "$function_name" \
    --query 'VpcConfig.VpcId' \
    --output text)"
  if [[ -n "$existing_vpc_id" && "$existing_vpc_id" != "None" ]]; then
    vpc_mode="vpc"
    proxy_private_ip="$(node -e '
      const { readFileSync } = require("node:fs");
      const variables = JSON.parse(readFileSync(process.argv[1], "utf8"));
      const value = variables.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER || variables.SCAN_PROXY_SERVER || variables.CERTSCORE_CHROMIUM_PROXY_SERVER;
      if (!value) process.exit(0);
      try {
        const hostname = new URL(value).hostname;
        if (/^(?:10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\./.test(hostname)) process.stdout.write(hostname);
      } catch {}
    ' "$existing_environment_json")"
    if [[ -n "$proxy_private_ip" ]]; then
      proxy_allocation_id="$(aws ec2 describe-network-interfaces \
        --region "$region" \
        --filters Name=vpc-id,Values="$existing_vpc_id" Name=private-ip-address,Values="$proxy_private_ip" \
        --query 'NetworkInterfaces[0].Association.AllocationId' \
        --output text)"
      proxy_public_ip="$(aws ec2 describe-network-interfaces \
        --region "$region" \
        --filters Name=vpc-id,Values="$existing_vpc_id" Name=private-ip-address,Values="$proxy_private_ip" \
        --query 'NetworkInterfaces[0].Association.PublicIp' \
        --output text)"
      if [[ -z "$proxy_allocation_id" || "$proxy_allocation_id" == "None" || -z "$proxy_public_ip" || "$proxy_public_ip" == "None" ]]; then
        echo "VPC-attached Lambda ${function_name} uses proxy ${proxy_private_ip}, but its EC2 network interface has no associated Elastic IP." >&2
        exit 1
      fi
      egress_id="aws-ec2-proxy:${region}:${proxy_allocation_id}"
      egress_provider="aws-ec2-proxy"
      egress_public_ip_hash="sha256:$(printf %s "$proxy_public_ip" | shasum -a 256 | awk '{print $1}')"
    else
      nat_allocation_id="$(aws ec2 describe-addresses \
        --region "$region" \
        --filters Name=tag:Purpose,Values=lambda-nat-egress \
        --query 'Addresses[0].AllocationId' \
        --output text)"
      nat_public_ip="$(aws ec2 describe-addresses \
        --region "$region" \
        --filters Name=tag:Purpose,Values=lambda-nat-egress \
        --query 'Addresses[0].PublicIp' \
        --output text)"
      if [[ -z "$nat_allocation_id" || "$nat_allocation_id" == "None" || -z "$nat_public_ip" || "$nat_public_ip" == "None" ]]; then
        echo "VPC-attached Lambda ${function_name} is missing its tagged lambda-nat-egress address." >&2
        exit 1
      fi
      egress_id="aws-nat:${region}:${nat_allocation_id}"
      egress_provider="aws-nat-gateway"
      egress_public_ip_hash="sha256:$(printf %s "$nat_public_ip" | shasum -a 256 | awk '{print $1}')"
    fi
  fi
fi

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
      "Resource": ${log_resources_json}
    },
    {
      "Effect": "Allow",
      "Action": "sqs:SendMessage",
      "Resource": ${sqs_resources_json}
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": ${s3_resources_json}
    },
    {
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": ${lambda_resources_json}
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:AssignPrivateIpAddresses",
        "ec2:CreateNetworkInterface",
        "ec2:DeleteNetworkInterface",
        "ec2:DescribeNetworkInterfaces",
        "ec2:UnassignPrivateIpAddresses"
      ],
      "Resource": "*"
    }
  ]
}
JSON

EXISTING_ENVIRONMENT_JSON="$existing_environment_json" \
CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET="$artifact_bucket" \
CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX="$artifact_prefix" \
CERTSCORE_V2_DAG_LAMBDA_EGRESS_ID="$egress_id" \
CERTSCORE_V2_DAG_LAMBDA_EGRESS_PROVIDER="$egress_provider" \
CERTSCORE_V2_DAG_LAMBDA_EGRESS_PUBLIC_IP_HASH="$egress_public_ip_hash" \
CERTSCORE_V2_DAG_LAMBDA_LOCATION_ENV_PREFIX="$location_env_prefix" \
CERTSCORE_V2_DAG_LAMBDA_VPC_MODE="$vpc_mode" \
SCANNER_IMAGE_DIGEST="$image_digest" \
node >"$environment_json" <<'NODE'
const { readFileSync } = require("node:fs");
const existing = JSON.parse(readFileSync(process.env.EXISTING_ENVIRONMENT_JSON, "utf8"));
const variables = {
  CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR: "/tmp/certscore-v2-dag-lambda",
  CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET: process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET,
  CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX: process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX,
  CERTSCORE_V2_DAG_LAMBDA_EGRESS_ID: process.env.CERTSCORE_V2_DAG_LAMBDA_EGRESS_ID,
  CERTSCORE_V2_DAG_LAMBDA_EGRESS_PROVIDER: process.env.CERTSCORE_V2_DAG_LAMBDA_EGRESS_PROVIDER,
  CERTSCORE_V2_DAG_LAMBDA_EGRESS_PUBLIC_IP_HASH: process.env.CERTSCORE_V2_DAG_LAMBDA_EGRESS_PUBLIC_IP_HASH,
  CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local",
  CERTSCORE_V2_DAG_LAMBDA_VPC_MODE: process.env.CERTSCORE_V2_DAG_LAMBDA_VPC_MODE,
  CERTSCORE_CHROMIUM_EXECUTABLE_PATH: "/usr/bin/chromium",
  SCANNER_IMAGE_DIGEST: process.env.SCANNER_IMAGE_DIGEST
};

const conservativeDefaults = {
  CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS: "false",
  CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE: "none",
  CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE: "webmd",
  CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE: "sharded",
  CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE: "always",
  CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS: "15000",
  CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS: "15000",
  CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY: "1",
  CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE: "cmp_safe"
};

const regionalContextDefaults = {
  EU_DE: {
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: "de-DE,de;q=0.9,en;q=0.8",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: "de-DE",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: "Europe/Berlin"
  },
  EU_IE: {
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: "en-IE,en;q=0.9",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: "en-IE",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: "Europe/Dublin"
  },
  US_WEST: {
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: "en-US,en;q=0.9",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: "en-US",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: "America/Los_Angeles"
  }
}[process.env.CERTSCORE_V2_DAG_LAMBDA_LOCATION_ENV_PREFIX] ?? {};

for (const [key, defaultValue] of Object.entries(conservativeDefaults)) {
  if (process.env[key] && String(process.env[key]).trim()) {
    variables[key] = String(process.env[key]).trim();
  } else {
    variables[key] = defaultValue;
  }
}

for (const [key, defaultValue] of Object.entries(regionalContextDefaults)) {
  if (process.env[key] && String(process.env[key]).trim()) {
    variables[key] = String(process.env[key]).trim();
  } else if (existing[key] && String(existing[key]).trim()) {
    variables[key] = String(existing[key]).trim();
  } else {
    variables[key] = defaultValue;
  }
}

for (const key of ["CERTSCORE_V2_DAG_LAMBDA_ACTION_FINAL_SETTLE_MS"]) {
  if (process.env[key] && String(process.env[key]).trim()) {
    variables[key] = String(process.env[key]).trim();
  } else if (existing[key] && String(existing[key]).trim()) {
    variables[key] = String(existing[key]).trim();
  }
}

for (const key of [
  "CERTSCORE_CHROMIUM_ACCEPT_LANGUAGE",
  "CERTSCORE_CHROMIUM_LOCALE",
  "CERTSCORE_CHROMIUM_TIMEZONE_ID",
  "CERTSCORE_CHROMIUM_USER_AGENT",
  "CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER",
  "CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME",
  "CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD",
  "CERTSCORE_CHROMIUM_PROXY_SERVER",
  "CERTSCORE_CHROMIUM_PROXY_USERNAME",
  "CERTSCORE_CHROMIUM_PROXY_PASSWORD",
  "SCAN_PROXY_ENABLED",
  "SCAN_PROXY_SERVER",
  "SCAN_EGRESS_LABEL",
  "CERTSCORE_V2_DAG_LAMBDA_EGRESS_LABEL",
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

aws lambda wait function-updated --region "$region" --function-name "$function_name"

aws lambda get-function-configuration \
  --region "$region" \
  --function-name "$function_name" \
  --query '{UserAgent:Environment.Variables.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT,Locale:Environment.Variables.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE,AcceptLanguage:Environment.Variables.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE,Timezone:Environment.Variables.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID,ProxyEnabled:Environment.Variables.SCAN_PROXY_ENABLED,EgressLabel:Environment.Variables.SCAN_EGRESS_LABEL}' \
  --output json >"$regional_browser_config"

REGIONAL_BROWSER_CONFIG="$regional_browser_config" \
CERTSCORE_V2_DAG_LAMBDA_LOCATION_ENV_PREFIX="$location_env_prefix" \
node <<'NODE'
const { readFileSync } = require("node:fs");
const observed = JSON.parse(readFileSync(process.env.REGIONAL_BROWSER_CONFIG, "utf8"));
const expectedByRegion = {
  EU_DE: { Locale: "de-DE", AcceptLanguage: "de-DE,de;q=0.9,en;q=0.8", Timezone: "Europe/Berlin" },
  EU_IE: { Locale: "en-IE", AcceptLanguage: "en-IE,en;q=0.9", Timezone: "Europe/Dublin" },
  US_WEST: { Locale: "en-US", AcceptLanguage: "en-US,en;q=0.9", Timezone: "America/Los_Angeles" },
};
const expected = expectedByRegion[process.env.CERTSCORE_V2_DAG_LAMBDA_LOCATION_ENV_PREFIX];
if (!expected) throw new Error("Unknown regional browser calibration.");
for (const [key, value] of Object.entries(expected)) {
  if (observed[key] !== value) {
    throw new Error(`Regional browser calibration mismatch for ${key}: expected ${value}, received ${observed[key] ?? "missing"}.`);
  }
}
if (!/^Mozilla\/5\.0 \(X11; Linux x86_64\).* Chrome\/150\.0\.0\.0 Safari\/537\.36$/.test(observed.UserAgent ?? "")) {
  throw new Error("Regional browser calibration requires the version-matched Linux Chrome 150 identity.");
}
if (/HeadlessChrome/i.test(observed.UserAgent)) {
  throw new Error("Regional browser calibration must not expose the HeadlessChrome token.");
}
if (String(observed.ProxyEnabled).toLowerCase() !== "true" || !String(observed.EgressLabel ?? "").trim()) {
  throw new Error("Regional browser calibration requires enabled, labeled regional egress.");
}
NODE

aws lambda put-function-event-invoke-config \
  --region "$region" \
  --function-name "$function_name" \
  --maximum-event-age-in-seconds 60 \
  --maximum-retry-attempts 0 \
  --destination-config "OnFailure={Destination=${failure_queue_arn}}" >/dev/null

cat <<EOF
Created/updated local v2 DAG Lambda image resources:
  AWS_REGION=${region}
  CERTSCORE_V2_DAG_LAMBDA_ENABLED=true
  CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME=${function_name}
  CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL=${queue_url}
  CERTSCORE_V2_DAG_LAMBDA_${location_env_prefix}_ENABLED=true
  CERTSCORE_V2_DAG_LAMBDA_${location_env_prefix}_FUNCTION_NAME=${function_name}
  CERTSCORE_V2_DAG_LAMBDA_${location_env_prefix}_RESULT_QUEUE_URL=${queue_url}
  CERTSCORE_V2_DAG_LAMBDA_ASYNC_FAILURE_QUEUE_URL=${failure_queue_url}
  CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV=local
  CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET=${artifact_bucket}
  CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX=${artifact_prefix}
  CERTSCORE_V2_DAG_LAMBDA_MEMORY_SIZE=${memory_size}
EOF
