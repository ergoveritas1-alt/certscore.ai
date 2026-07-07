#!/usr/bin/env bash
set -euo pipefail

region="${AWS_REGION:-${1:-}}"
scan_from="${SCAN_FROM:-${2:-}}"
function_name="${CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME:-certscore-v2-dag-local-lambda}"
proxy_port="${CERTSCORE_V2_DAG_LAMBDA_PROXY_PORT:-3128}"
instance_type="${CERTSCORE_V2_DAG_LAMBDA_PROXY_INSTANCE_TYPE:-t4g.micro}"
private_cidr="${CERTSCORE_V2_DAG_LAMBDA_PRIVATE_CIDR:-172.31.240.0/24}"

if [[ -z "$region" || -z "$scan_from" ]]; then
  cat >&2 <<'EOF'
Usage:
  AWS_REGION=eu-central-1 SCAN_FROM=eu_de scripts/provision-v2-dag-lambda-regional-egress.sh
  AWS_REGION=us-west-2 SCAN_FROM=california scripts/provision-v2-dag-lambda-regional-egress.sh

Creates or reuses a regional EC2 HTTP proxy + EIP, a Lambda private subnet,
NAT Gateway, route table, and Lambda proxy/VPC configuration for the v2 DAG
scanner Lambda.
EOF
  exit 1
fi

case "$scan_from:$region" in
  eu_de:eu-central-1)
    label="eu-de-ec2-proxy-t4g-micro"
    accept_language="de-DE,de;q=0.9,en;q=0.8"
    locale="de-DE"
    timezone="Europe/Berlin"
    ;;
  california:us-west-2)
    label="us-ca-ec2-proxy-t4g-micro"
    accept_language="en-US,en;q=0.9"
    locale="en-US"
    timezone="America/Los_Angeles"
    ;;
  eu_ie:eu-west-1)
    label="eu-ie-ec2-proxy-t4g-micro"
    accept_language="en-IE,en;q=0.9"
    locale="en-IE"
    timezone="Europe/Dublin"
    ;;
  *)
    echo "Unsupported scanFrom/region pair: scanFrom=${scan_from}, region=${region}" >&2
    exit 1
    ;;
esac

run() {
  echo "+ $*" >&2
  "$@"
}

vpc_id="$(aws ec2 describe-vpcs \
  --region "$region" \
  --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' \
  --output text)"
if [[ -z "$vpc_id" || "$vpc_id" == "None" ]]; then
  echo "No default VPC found in ${region}." >&2
  exit 1
fi

public_subnet_id="$(aws ec2 describe-subnets \
  --region "$region" \
  --filters Name=vpc-id,Values="$vpc_id" Name=map-public-ip-on-launch,Values=true \
  --query 'sort_by(Subnets,&AvailabilityZone)[0].SubnetId' \
  --output text)"
public_az="$(aws ec2 describe-subnets \
  --region "$region" \
  --subnet-ids "$public_subnet_id" \
  --query 'Subnets[0].AvailabilityZone' \
  --output text)"

lambda_sg_name="certscore-v2-dag-lambda-egress"
proxy_sg_name="certscore-v2-dag-ec2-proxy-${scan_from}"
private_subnet_name="certscore-v2-dag-lambda-private-${region}a"
nat_name="certscore-v2-dag-lambda-nat-${region}"
route_table_name="certscore-v2-dag-lambda-private-rt-${region}"

lambda_sg_id="$(aws ec2 describe-security-groups \
  --region "$region" \
  --filters Name=vpc-id,Values="$vpc_id" Name=group-name,Values="$lambda_sg_name" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null || true)"
if [[ -z "$lambda_sg_id" || "$lambda_sg_id" == "None" ]]; then
  lambda_sg_id="$(run aws ec2 create-security-group \
    --region "$region" \
    --vpc-id "$vpc_id" \
    --group-name "$lambda_sg_name" \
    --description "CertScore v2 DAG Lambda NAT/proxy egress" \
    --query GroupId \
    --output text)"
  run aws ec2 create-tags --region "$region" --resources "$lambda_sg_id" --tags \
    Key=Name,Value="$lambda_sg_name" Key=Project,Value=CertScore Key=Purpose,Value=lambda-nat-egress >/dev/null
fi

proxy_sg_id="$(aws ec2 describe-security-groups \
  --region "$region" \
  --filters Name=vpc-id,Values="$vpc_id" Name=group-name,Values="$proxy_sg_name" \
  --query 'SecurityGroups[0].GroupId' \
  --output text 2>/dev/null || true)"
if [[ -z "$proxy_sg_id" || "$proxy_sg_id" == "None" ]]; then
  proxy_sg_id="$(run aws ec2 create-security-group \
    --region "$region" \
    --vpc-id "$vpc_id" \
    --group-name "$proxy_sg_name" \
    --description "CertScore regional EC2 HTTP proxy for v2 DAG Lambda browser egress" \
    --query GroupId \
    --output text)"
  run aws ec2 create-tags --region "$region" --resources "$proxy_sg_id" --tags \
    Key=Name,Value="$proxy_sg_name" Key=Project,Value=CertScore Key=Purpose,Value=lambda-browser-egress-proxy >/dev/null
fi

aws ec2 authorize-security-group-ingress \
  --region "$region" \
  --group-id "$proxy_sg_id" \
  --ip-permissions "IpProtocol=tcp,FromPort=${proxy_port},ToPort=${proxy_port},UserIdGroupPairs=[{GroupId=${lambda_sg_id},Description=CertScore Lambda browser proxy access}]" >/dev/null 2>&1 || true

private_subnet_id="$(aws ec2 describe-subnets \
  --region "$region" \
  --filters Name=vpc-id,Values="$vpc_id" "Name=tag:Name,Values=$private_subnet_name" \
  --query 'Subnets[0].SubnetId' \
  --output text 2>/dev/null || true)"
if [[ -z "$private_subnet_id" || "$private_subnet_id" == "None" ]]; then
  private_subnet_id="$(run aws ec2 create-subnet \
    --region "$region" \
    --vpc-id "$vpc_id" \
    --cidr-block "$private_cidr" \
    --availability-zone "$public_az" \
    --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${private_subnet_name}},{Key=Project,Value=CertScore},{Key=Purpose,Value=lambda-nat-egress}]" \
    --query 'Subnet.SubnetId' \
    --output text)"
  run aws ec2 modify-subnet-attribute --region "$region" --subnet-id "$private_subnet_id" --no-map-public-ip-on-launch
fi

nat_id="$(aws ec2 describe-nat-gateways \
  --region "$region" \
  --filter Name=vpc-id,Values="$vpc_id" Name=state,Values=available,pending "Name=tag:Name,Values=$nat_name" \
  --query 'NatGateways[0].NatGatewayId' \
  --output text 2>/dev/null || true)"
if [[ -z "$nat_id" || "$nat_id" == "None" ]]; then
  nat_eip_allocation_id="$(run aws ec2 allocate-address \
    --region "$region" \
    --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=${nat_name}-eip},{Key=Project,Value=CertScore},{Key=Purpose,Value=lambda-nat-egress}]" \
    --query AllocationId \
    --output text)"
  nat_id="$(run aws ec2 create-nat-gateway \
    --region "$region" \
    --subnet-id "$public_subnet_id" \
    --allocation-id "$nat_eip_allocation_id" \
    --tag-specifications "ResourceType=natgateway,Tags=[{Key=Name,Value=${nat_name}},{Key=Project,Value=CertScore},{Key=Purpose,Value=lambda-nat-egress}]" \
    --query 'NatGateway.NatGatewayId' \
    --output text)"
fi
run aws ec2 wait nat-gateway-available --region "$region" --nat-gateway-ids "$nat_id"

route_table_id="$(aws ec2 describe-route-tables \
  --region "$region" \
  --filters Name=vpc-id,Values="$vpc_id" "Name=tag:Name,Values=$route_table_name" \
  --query 'RouteTables[0].RouteTableId' \
  --output text 2>/dev/null || true)"
if [[ -z "$route_table_id" || "$route_table_id" == "None" ]]; then
  route_table_id="$(run aws ec2 create-route-table \
    --region "$region" \
    --vpc-id "$vpc_id" \
    --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${route_table_name}},{Key=Project,Value=CertScore},{Key=Purpose,Value=lambda-nat-egress}]" \
    --query 'RouteTable.RouteTableId' \
    --output text)"
fi
aws ec2 create-route --region "$region" --route-table-id "$route_table_id" --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$nat_id" >/dev/null 2>&1 || \
  aws ec2 replace-route --region "$region" --route-table-id "$route_table_id" --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$nat_id" >/dev/null

existing_assoc="$(aws ec2 describe-route-tables \
  --region "$region" \
  --filters Name=association.subnet-id,Values="$private_subnet_id" \
  --query 'RouteTables[0].Associations[0].RouteTableAssociationId' \
  --output text 2>/dev/null || true)"
if [[ -z "$existing_assoc" || "$existing_assoc" == "None" ]]; then
  run aws ec2 associate-route-table --region "$region" --route-table-id "$route_table_id" --subnet-id "$private_subnet_id" >/dev/null
fi

proxy_instance_id="$(aws ec2 describe-instances \
  --region "$region" \
  --filters Name=vpc-id,Values="$vpc_id" "Name=tag:Name,Values=$label" Name=instance-state-name,Values=pending,running,stopped \
  --query 'Reservations[].Instances[] | [0].InstanceId' \
  --output text 2>/dev/null || true)"
if [[ -z "$proxy_instance_id" || "$proxy_instance_id" == "None" ]]; then
  image_id="$(aws ec2 describe-images \
    --region "$region" \
    --owners amazon \
    --filters 'Name=name,Values=al2023-ami-2023.*-kernel-6.1-arm64' 'Name=state,Values=available' \
    --query 'sort_by(Images,&CreationDate)[-1].ImageId' \
    --output text)"
  user_data="$(mktemp)"
  trap 'rm -f "$user_data"' EXIT
  cat >"$user_data" <<EOF
#!/bin/bash
set -euxo pipefail
dnf install -y squid
cat >/etc/squid/squid.conf <<'SQUID'
acl localnet src 172.31.0.0/16
acl SSL_ports port 443
acl Safe_ports port 80
acl Safe_ports port 443
acl CONNECT method CONNECT
http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access allow localnet
http_access deny all
http_port ${proxy_port}
via off
forwarded_for delete
request_header_access X-Forwarded-For deny all
request_header_access Via deny all
request_header_access Cache-Control deny all
SQUID
systemctl enable --now squid
EOF
  proxy_instance_id="$(run aws ec2 run-instances \
    --region "$region" \
    --image-id "$image_id" \
    --instance-type "$instance_type" \
    --subnet-id "$public_subnet_id" \
    --security-group-ids "$proxy_sg_id" \
    --metadata-options HttpTokens=required,HttpPutResponseHopLimit=2 \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${label}},{Key=Project,Value=CertScore},{Key=Purpose,Value=lambda-browser-egress-proxy}]" "ResourceType=volume,Tags=[{Key=Name,Value=${label}-root},{Key=Project,Value=CertScore},{Key=Purpose,Value=lambda-browser-egress-proxy}]" \
    --user-data "file://${user_data}" \
    --query 'Instances[0].InstanceId' \
    --output text)"
fi

state="$(aws ec2 describe-instances --region "$region" --instance-ids "$proxy_instance_id" --query 'Reservations[0].Instances[0].State.Name' --output text)"
if [[ "$state" == "stopped" ]]; then
  run aws ec2 start-instances --region "$region" --instance-ids "$proxy_instance_id" >/dev/null
fi
run aws ec2 wait instance-running --region "$region" --instance-ids "$proxy_instance_id"

association_public_ip="$(aws ec2 describe-instances \
  --region "$region" \
  --instance-ids "$proxy_instance_id" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)"
if [[ -z "$association_public_ip" || "$association_public_ip" == "None" ]]; then
  proxy_eip_allocation_id="$(run aws ec2 allocate-address \
    --region "$region" \
    --domain vpc \
    --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=${label}-eip},{Key=Project,Value=CertScore},{Key=Purpose,Value=lambda-browser-egress-proxy}]" \
    --query AllocationId \
    --output text)"
  run aws ec2 associate-address --region "$region" --instance-id "$proxy_instance_id" --allocation-id "$proxy_eip_allocation_id" >/dev/null
fi

proxy_private_ip="$(aws ec2 describe-instances \
  --region "$region" \
  --instance-ids "$proxy_instance_id" \
  --query 'Reservations[0].Instances[0].PrivateIpAddress' \
  --output text)"
proxy_public_ip="$(aws ec2 describe-instances \
  --region "$region" \
  --instance-ids "$proxy_instance_id" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)"

existing_env="$(mktemp)"
merged_env="$(mktemp)"
trap 'rm -f "$existing_env" "$merged_env" "${user_data:-}"' EXIT
aws lambda get-function-configuration \
  --region "$region" \
  --function-name "$function_name" \
  --query 'Environment.Variables' \
  --output json >"$existing_env"

jq \
  --arg proxy "http://${proxy_private_ip}:${proxy_port}" \
  --arg label "$label" \
  --arg accept_language "$accept_language" \
  --arg locale "$locale" \
  --arg timezone "$timezone" \
  '. + {
    SCAN_PROXY_ENABLED: "true",
    SCAN_PROXY_SERVER: $proxy,
    SCAN_EGRESS_LABEL: $label,
    CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER: $proxy,
    CERTSCORE_V2_DAG_LAMBDA_EGRESS_LABEL: $label,
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: $accept_language,
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: $locale,
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: $timezone
  } | {Variables:.}' "$existing_env" >"$merged_env"

run aws lambda update-function-configuration \
  --region "$region" \
  --function-name "$function_name" \
  --vpc-config "SubnetIds=${private_subnet_id},SecurityGroupIds=${lambda_sg_id}" >/dev/null
run aws lambda wait function-updated --region "$region" --function-name "$function_name"
run aws lambda update-function-configuration \
  --region "$region" \
  --function-name "$function_name" \
  --environment "file://${merged_env}" >/dev/null
run aws lambda wait function-updated --region "$region" --function-name "$function_name"

cat <<EOF
Configured regional v2 DAG Lambda egress:
  region=${region}
  scanFrom=${scan_from}
  function=${function_name}
  privateSubnet=${private_subnet_id}
  lambdaSecurityGroup=${lambda_sg_id}
  natGateway=${nat_id}
  proxyInstance=${proxy_instance_id}
  proxyPrivate=${proxy_private_ip}
  proxyPublic=${proxy_public_ip}
  proxyEnv=http://${proxy_private_ip}:${proxy_port}
  label=${label}
EOF
