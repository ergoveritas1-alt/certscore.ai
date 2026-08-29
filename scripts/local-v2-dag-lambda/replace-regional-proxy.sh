#!/bin/bash
set -euo pipefail

region="${1:-}"
apply=""
rotate_eip="false"
function_name="${CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME:-certscore-v2-dag-local-lambda}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template_path="${script_dir}/canonical-regional-proxy-user-data.sh"

for argument in "${@:2}"; do
  case "$argument" in
    --apply) apply="--apply" ;;
    --rotate-eip) rotate_eip="true" ;;
    *)
      echo "Unsupported argument: ${argument}" >&2
      exit 1
      ;;
  esac
done

case "$region" in
  eu-central-1)
    location_slug="eu-de"
    proxy_config_tag="ireland-parity-v1"
    expected_locale="de-DE"
    expected_accept_language="de-DE,de;q=0.9,en;q=0.8"
    expected_timezone="Europe/Berlin"
    ;;
  eu-west-1)
    location_slug="eu-ie"
    proxy_config_tag="ireland-parity-v1"
    expected_locale="en-IE"
    expected_accept_language="en-IE,en;q=0.9"
    expected_timezone="Europe/Dublin"
    ;;
  us-west-1)
    location_slug="us-ca"
    proxy_config_tag="us-ca-vpc-v1"
    expected_locale="en-US"
    expected_accept_language="en-US,en;q=0.9"
    expected_timezone="America/Los_Angeles"
    ;;
  *)
    echo "Usage: $0 eu-central-1|eu-west-1|us-west-1 [--rotate-eip] [--apply]" >&2
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
  ["memory", fn.Configuration?.MemorySize, 3008],
  ["timeout", fn.Configuration?.Timeout, 75],
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
vpc_cidr="$(aws ec2 describe-vpcs \
  --region "$region" \
  --vpc-ids "$vpc_id" \
  --query 'Vpcs[0].CidrBlock' \
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
lambda_security_group_ids="$(node - "$lambda_json" <<'NODE'
const { readFileSync } = require("node:fs");
const fn = JSON.parse(readFileSync(process.argv[2], "utf8"));
process.stdout.write((fn.Configuration?.VpcConfig?.SecurityGroupIds ?? []).join(" "));
NODE
)"
endpoint_security_group_ids="$(aws ec2 describe-vpc-endpoints \
  --region "$region" \
  --filters "Name=vpc-id,Values=${vpc_id}" "Name=vpc-endpoint-type,Values=Interface" \
  --query 'VpcEndpoints[].Groups[].GroupId' \
  --output text)"
s3_prefix_list_id="$(aws ec2 describe-managed-prefix-lists \
  --region "$region" \
  --filters Name=prefix-list-name,Values="com.amazonaws.${region}.s3" \
  --query 'PrefixLists[0].PrefixListId' \
  --output text)"

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
sed \
  -e "s|__CERTSCORE_VISIBLE_HOSTNAME__|${visible_hostname}|g" \
  -e "s|__CERTSCORE_LAMBDA_VPC_CIDR__|${vpc_cidr}|g" \
  "$template_path" >"$user_data"

echo "Region: ${region}"
echo "Function: ${function_name}"
echo "Current proxy: ${old_instance_id} (${old_proxy_private_ip})"
echo "Replacement AMI: ${ami_id}"
echo "Proxy subnet: ${proxy_subnet_id}"
echo "Proxy security group: ${proxy_security_group_id}"
if [[ "$rotate_eip" == "true" ]]; then
  echo "Elastic IP action: allocate a fresh address; retain ${public_ip} (${allocation_id}) on the rollback proxy"
else
  echo "Elastic IP action: retain ${public_ip} (${allocation_id})"
fi

if [[ "$apply" != "--apply" ]]; then
  exit 0
fi

for lambda_security_group_id in $lambda_security_group_ids; do
  aws ec2 revoke-security-group-egress --region "$region" --group-id "$lambda_security_group_id" --ip-permissions IpProtocol=-1,IpRanges='[{CidrIp=0.0.0.0/0}]' >/dev/null 2>&1 || true
  aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_security_group_id" --ip-permissions "IpProtocol=tcp,FromPort=3128,ToPort=3128,UserIdGroupPairs=[{GroupId=${proxy_security_group_id},Description=Scanner-proxy-only}]" >/dev/null 2>&1 || true
  aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_security_group_id" --ip-permissions "IpProtocol=udp,FromPort=53,ToPort=53,IpRanges=[{CidrIp=${vpc_cidr},Description=VPC-DNS}]" >/dev/null 2>&1 || true
  aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_security_group_id" --ip-permissions "IpProtocol=tcp,FromPort=53,ToPort=53,IpRanges=[{CidrIp=${vpc_cidr},Description=VPC-DNS-TCP}]" >/dev/null 2>&1 || true
  for endpoint_security_group_id in $endpoint_security_group_ids; do
    aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_security_group_id" --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,UserIdGroupPairs=[{GroupId=${endpoint_security_group_id},Description=Private-AWS-endpoint}]" >/dev/null 2>&1 || true
  done
  if [[ -n "$s3_prefix_list_id" && "$s3_prefix_list_id" != "None" ]]; then
    aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_security_group_id" --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=${s3_prefix_list_id},Description=S3-gateway}]" >/dev/null 2>&1 || true
  fi
done

new_instance_id="$(aws ec2 run-instances \
  --region "$region" \
  --image-id "$ami_id" \
  --instance-type t4g.micro \
  --credit-specification CpuCredits=unlimited \
  --subnet-id "$proxy_subnet_id" \
  --security-group-ids "$proxy_security_group_id" \
  --associate-public-ip-address \
  --metadata-options HttpTokens=required,HttpPutResponseHopLimit=1,HttpEndpoint=enabled \
  --user-data "file://${user_data}" \
  --tag-specifications \
    "ResourceType=instance,Tags=[{Key=Name,Value=${location_slug}-ec2-proxy-t4g-micro},{Key=Project,Value=CertScore},{Key=Purpose,Value=lambda-browser-egress-proxy},{Key=CertScoreProxyConfig,Value=${proxy_config_tag}}]" \
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

active_allocation_id="$allocation_id"
active_public_ip="$public_ip"
if [[ "$rotate_eip" == "true" ]]; then
  rotation_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  new_address_json="$(aws ec2 allocate-address \
    --region "$region" \
    --domain vpc \
    --tag-specifications \
      "ResourceType=elastic-ip,Tags=[{Key=Name,Value=certscore-${location_slug}-proxy-eip-${rotation_timestamp}},{Key=Project,Value=CertScore},{Key=Purpose,Value=lambda-browser-egress-proxy},{Key=Region,Value=${location_slug}},{Key=Rotation,Value=${rotation_timestamp}}]" \
    --output json)"
  active_allocation_id="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.AllocationId ?? "")' "$new_address_json")"
  active_public_ip="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.PublicIp ?? "")' "$new_address_json")"
  if [[ -z "$active_allocation_id" || -z "$active_public_ip" ]]; then
    echo "Fresh Elastic IP allocation did not return a complete identity; leaving the replacement proxy for inspection." >&2
    exit 1
  fi
  aws ec2 associate-address \
    --region "$region" \
    --instance-id "$new_instance_id" \
    --allocation-id "$active_allocation_id" \
    --allow-reassociation >/dev/null
  echo "Fresh Elastic IP associated with the replacement proxy: ${active_public_ip} (${active_allocation_id})"
fi

node - "$lambda_json" "$new_private_ip" "$region" "$active_allocation_id" "$active_public_ip" >"$environment_json" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const [path, privateIp, region, allocationId, publicIp] = process.argv.slice(2);
const fn = JSON.parse(readFileSync(path, "utf8"));
const variables = { ...(fn.Configuration?.Environment?.Variables ?? {}) };
const proxyServer = `http://${privateIp}:3128`;
variables.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER = proxyServer;
variables.SCAN_PROXY_SERVER = proxyServer;
variables.CERTSCORE_PUBLIC_NETWORK_GUARD_DISABLED = "false";
variables.CERTSCORE_V2_DAG_LAMBDA_EGRESS_ID = `aws-ec2-proxy:${region}:${allocationId}`;
variables.CERTSCORE_V2_DAG_LAMBDA_EGRESS_PROVIDER = "aws-ec2-proxy";
variables.CERTSCORE_V2_DAG_LAMBDA_EGRESS_PUBLIC_IP_HASH = `sha256:${createHash("sha256").update(publicIp).digest("hex")}`;
process.stdout.write(JSON.stringify({ Variables: variables }));
NODE

if [[ "$rotate_eip" != "true" ]]; then
  aws ec2 associate-address \
    --region "$region" \
    --instance-id "$new_instance_id" \
    --allocation-id "$allocation_id" \
    --allow-reassociation >/dev/null
fi

aws lambda update-function-configuration \
  --region "$region" \
  --function-name "$function_name" \
  --environment "file://${environment_json}" >/dev/null
aws lambda wait function-updated --region "$region" --function-name "$function_name"

echo "Regional proxy cutover complete."
echo "New proxy: ${new_instance_id} (${new_private_ip})"
if [[ "$rotate_eip" == "true" ]]; then
  echo "Active Elastic IP: ${active_public_ip} (${active_allocation_id})"
  echo "Rollback proxy and Elastic IP retained until the regional smoke scan passes: ${old_instance_id}, ${public_ip} (${allocation_id})"
else
  echo "Old proxy retained for rollback until the regional smoke scan passes: ${old_instance_id}"
  echo "Elastic IP retained: ${public_ip}"
fi
