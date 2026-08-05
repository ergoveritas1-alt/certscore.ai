#!/bin/bash
set -euo pipefail

region="${1:-}"
apply="${2:-}"
function_name="${CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME:-certscore-v2-dag-local-lambda}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template_path="${script_dir}/canonical-regional-proxy-user-data.sh"

case "$region" in
  eu-central-1)
    location_slug="eu-de"
    expected_locale="de-DE"
    expected_accept_language="de-DE,de;q=0.9,en;q=0.8"
    expected_timezone="Europe/Berlin"
    ;;
  eu-west-1)
    location_slug="eu-ie"
    expected_locale="en-IE"
    expected_accept_language="en-IE,en;q=0.9"
    expected_timezone="Europe/Dublin"
    ;;
  us-west-2)
    location_slug="us-ca"
    expected_locale="en-US"
    expected_accept_language="en-US,en;q=0.9"
    expected_timezone="America/Los_Angeles"
    ;;
  *)
    echo "Usage: $0 eu-central-1|eu-west-1|us-west-2 [--apply]" >&2
    exit 1
    ;;
esac

if [[ "$apply" != "--apply" ]]; then
  echo "Plan only. Re-run with --apply to replace the ${region} proxy."
fi

lambda_json="$(mktemp)"
environment_json="$(mktemp)"
user_data="$(mktemp)"
trap 'rm -f "$lambda_json" "$environment_json" "$user_data"' EXIT

aws lambda get-function --region "$region" --function-name "$function_name" --output json >"$lambda_json"

node - "$lambda_json" "$expected_locale" "$expected_accept_language" "$expected_timezone" <<'NODE'
const { readFileSync } = require("node:fs");
const [path, expectedLocale, expectedAcceptLanguage, expectedTimezone] = process.argv.slice(2);
const fn = JSON.parse(readFileSync(path, "utf8"));
const env = fn.Configuration?.Environment?.Variables ?? {};
const checks = [
  ["memory", fn.Configuration?.MemorySize, 4096],
  ["timeout", fn.Configuration?.Timeout, 900],
  ["architecture", fn.Configuration?.Architectures?.[0], "x86_64"],
  ["ephemeral storage", fn.Configuration?.EphemeralStorage?.Size, 512],
  ["locale", env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE, expectedLocale],
  ["accept language", env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE, expectedAcceptLanguage],
  ["timezone", env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID, expectedTimezone],
];
for (const [label, observed, expected] of checks) {
  if (observed !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${observed ?? "missing"}`);
  }
}
if (env.SCAN_PROXY_ENABLED !== "true") {
  throw new Error("Regional scanner proxy is not enabled.");
}
NODE

old_proxy_private_ip="$(node - "$lambda_json" <<'NODE'
const { readFileSync } = require("node:fs");
const fn = JSON.parse(readFileSync(process.argv[2], "utf8"));
const env = fn.Configuration?.Environment?.Variables ?? {};
const value = env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER || env.SCAN_PROXY_SERVER;
if (!value) throw new Error("Regional Lambda proxy server is missing.");
process.stdout.write(new URL(value).hostname);
NODE
)"

vpc_id="$(aws lambda get-function-configuration \
  --region "$region" \
  --function-name "$function_name" \
  --query 'VpcConfig.VpcId' \
  --output text)"
old_network_interface_json="$(aws ec2 describe-network-interfaces \
  --region "$region" \
  --filters "Name=vpc-id,Values=${vpc_id}" "Name=private-ip-address,Values=${old_proxy_private_ip}" \
  --query 'NetworkInterfaces[0]' \
  --output json)"
old_instance_id="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.Attachment?.InstanceId ?? "")' "$old_network_interface_json")"
proxy_security_group_id="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.Groups?.[0]?.GroupId ?? "")' "$old_network_interface_json")"
proxy_subnet_id="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.SubnetId ?? "")' "$old_network_interface_json")"
allocation_id="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.Association?.AllocationId ?? "")' "$old_network_interface_json")"
public_ip="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.Association?.PublicIp ?? "")' "$old_network_interface_json")"

for required in "$old_instance_id" "$proxy_security_group_id" "$proxy_subnet_id" "$allocation_id" "$public_ip"; do
  if [[ -z "$required" ]]; then
    echo "Could not resolve the current regional proxy topology." >&2
    exit 1
  fi
done

ami_id="$(aws ssm get-parameter \
  --region "$region" \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-arm64 \
  --query 'Parameter.Value' \
  --output text)"
visible_hostname="certscore-${location_slug}-proxy"
sed "s/__CERTSCORE_VISIBLE_HOSTNAME__/${visible_hostname}/g" "$template_path" >"$user_data"

echo "Region: ${region}"
echo "Function: ${function_name}"
echo "Current proxy: ${old_instance_id} (${old_proxy_private_ip})"
echo "Replacement AMI: ${ami_id}"
echo "Proxy subnet: ${proxy_subnet_id}"
echo "Proxy security group: ${proxy_security_group_id}"
echo "Retained Elastic IP: ${public_ip} (${allocation_id})"

if [[ "$apply" != "--apply" ]]; then
  exit 0
fi

new_instance_id="$(aws ec2 run-instances \
  --region "$region" \
  --image-id "$ami_id" \
  --instance-type t4g.micro \
  --credit-specification CpuCredits=unlimited \
  --subnet-id "$proxy_subnet_id" \
  --security-group-ids "$proxy_security_group_id" \
  --associate-public-ip-address \
  --metadata-options HttpTokens=required,HttpPutResponseHopLimit=2,HttpEndpoint=enabled \
  --user-data "file://${user_data}" \
  --tag-specifications \
    "ResourceType=instance,Tags=[{Key=Name,Value=${location_slug}-ec2-proxy-t4g-micro},{Key=Project,Value=CertScore},{Key=Purpose,Value=lambda-browser-egress-proxy},{Key=CertScoreProxyConfig,Value=ireland-parity-v1}]" \
  --query 'Instances[0].InstanceId' \
  --output text)"

echo "Created replacement proxy ${new_instance_id}; waiting for EC2 health checks."
aws ec2 wait instance-status-ok --region "$region" --instance-ids "$new_instance_id"

new_private_ip="$(aws ec2 describe-instances \
  --region "$region" \
  --instance-ids "$new_instance_id" \
  --query 'Reservations[0].Instances[0].PrivateIpAddress' \
  --output text)"

# Cloud-init installs and starts Squid. EC2 status can become healthy shortly
# before cloud-init finishes, so wait for the port from inside the VPC by
# allowing a short bounded initialization window before switching Lambda.
for attempt in 1 2 3 4 5 6; do
  console_output="$(aws ec2 get-console-output \
    --region "$region" \
    --instance-id "$new_instance_id" \
    --latest \
    --query Output \
    --output text 2>/dev/null || true)"
  if [[ "$console_output" == *"Cloud-init"* && "$console_output" == *"finished"* ]]; then
    break
  fi
  if [[ "$attempt" == "6" ]]; then
    echo "Replacement proxy cloud-init did not report completion; leaving both instances running and aborting before Lambda cutover." >&2
    exit 1
  fi
  sleep 10
done

node - "$lambda_json" "$new_private_ip" >"$environment_json" <<'NODE'
const { readFileSync } = require("node:fs");
const [path, privateIp] = process.argv.slice(2);
const fn = JSON.parse(readFileSync(path, "utf8"));
const variables = { ...(fn.Configuration?.Environment?.Variables ?? {}) };
const proxyServer = `http://${privateIp}:3128`;
variables.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER = proxyServer;
variables.SCAN_PROXY_SERVER = proxyServer;
process.stdout.write(JSON.stringify({ Variables: variables }));
NODE

aws lambda update-function-configuration \
  --region "$region" \
  --function-name "$function_name" \
  --environment "file://${environment_json}" >/dev/null
aws lambda wait function-updated --region "$region" --function-name "$function_name"

aws ec2 associate-address \
  --region "$region" \
  --instance-id "$new_instance_id" \
  --allocation-id "$allocation_id" \
  --allow-reassociation >/dev/null

echo "Regional proxy cutover complete."
echo "New proxy: ${new_instance_id} (${new_private_ip})"
echo "Old proxy retained for rollback until the regional smoke scan passes: ${old_instance_id}"
echo "Elastic IP retained: ${public_ip}"
