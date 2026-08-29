#!/usr/bin/env bash
set -euo pipefail

region="${AWS_REGION:-us-west-1}"
vpc_name="certscore-v2-dag-us-ca-vpc"
vpc_cidr="${CERTSCORE_V2_DAG_LAMBDA_US_CA_VPC_CIDR:-10.241.0.0/16}"
public_subnet_cidr="10.241.0.0/20"
lambda_subnet_a_cidr="10.241.16.0/20"
lambda_subnet_c_cidr="10.241.32.0/20"
project="CertScore"
purpose="lambda-browser-egress"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
template_path="${script_dir}/canonical-regional-proxy-user-data.sh"

if [[ "$region" != "us-west-1" ]]; then
  echo "This script is intentionally limited to the California lane in us-west-1." >&2
  exit 1
fi

account_id="$(aws sts get-caller-identity --query Account --output text)"
az_a="$(aws ec2 describe-availability-zones --region "$region" --filters Name=state,Values=available --query 'AvailabilityZones[0].ZoneName' --output text)"
az_c="$(aws ec2 describe-availability-zones --region "$region" --filters Name=state,Values=available --query 'AvailabilityZones[1].ZoneName' --output text)"

vpc_id="$(aws ec2 describe-vpcs --region "$region" --filters Name=tag:Name,Values="$vpc_name" --query 'Vpcs[0].VpcId' --output text)"
if [[ -z "$vpc_id" || "$vpc_id" == "None" ]]; then
  vpc_id="$(aws ec2 create-vpc --region "$region" --cidr-block "$vpc_cidr" --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=${vpc_name}},{Key=Project,Value=${project}},{Key=Purpose,Value=scanner-california-lane}]" --query 'Vpc.VpcId' --output text)"
  aws ec2 modify-vpc-attribute --region "$region" --vpc-id "$vpc_id" --enable-dns-support '{"Value":true}'
  aws ec2 modify-vpc-attribute --region "$region" --vpc-id "$vpc_id" --enable-dns-hostnames '{"Value":true}'
fi

igw_id="$(aws ec2 describe-internet-gateways --region "$region" --filters Name=attachment.vpc-id,Values="$vpc_id" --query 'InternetGateways[0].InternetGatewayId' --output text)"
if [[ -z "$igw_id" || "$igw_id" == "None" ]]; then
  igw_id="$(aws ec2 create-internet-gateway --region "$region" --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${vpc_name}-igw},{Key=Project,Value=${project}},{Key=Purpose,Value=scanner-california-lane}]" --query 'InternetGateway.InternetGatewayId' --output text)"
  aws ec2 attach-internet-gateway --region "$region" --internet-gateway-id "$igw_id" --vpc-id "$vpc_id"
fi

subnet_id() {
  local name="$1"
  aws ec2 describe-subnets --region "$region" --filters Name=vpc-id,Values="$vpc_id" Name=tag:Name,Values="$name" --query 'Subnets[0].SubnetId' --output text
}

public_subnet_id="$(subnet_id "${vpc_name}-public")"
if [[ -z "$public_subnet_id" || "$public_subnet_id" == "None" ]]; then
  public_subnet_id="$(aws ec2 create-subnet --region "$region" --vpc-id "$vpc_id" --cidr-block "$public_subnet_cidr" --availability-zone "$az_a" --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${vpc_name}-public},{Key=Project,Value=${project}},{Key=Purpose,Value=proxy-public-egress}]" --query 'Subnet.SubnetId' --output text)"
fi
lambda_subnet_a_id="$(subnet_id "${vpc_name}-lambda-a")"
if [[ -z "$lambda_subnet_a_id" || "$lambda_subnet_a_id" == "None" ]]; then
  lambda_subnet_a_id="$(aws ec2 create-subnet --region "$region" --vpc-id "$vpc_id" --cidr-block "$lambda_subnet_a_cidr" --availability-zone "$az_a" --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${vpc_name}-lambda-a},{Key=Project,Value=${project}},{Key=Purpose,Value=lambda-private}]" --query 'Subnet.SubnetId' --output text)"
fi
lambda_subnet_c_id="$(subnet_id "${vpc_name}-lambda-c")"
if [[ -z "$lambda_subnet_c_id" || "$lambda_subnet_c_id" == "None" ]]; then
  lambda_subnet_c_id="$(aws ec2 create-subnet --region "$region" --vpc-id "$vpc_id" --cidr-block "$lambda_subnet_c_cidr" --availability-zone "$az_c" --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${vpc_name}-lambda-c},{Key=Project,Value=${project}},{Key=Purpose,Value=lambda-private}]" --query 'Subnet.SubnetId' --output text)"
fi

public_route_table_id="$(aws ec2 describe-route-tables --region "$region" --filters Name=vpc-id,Values="$vpc_id" Name=tag:Name,Values="${vpc_name}-public-rt" --query 'RouteTables[0].RouteTableId' --output text)"
if [[ -z "$public_route_table_id" || "$public_route_table_id" == "None" ]]; then
  public_route_table_id="$(aws ec2 create-route-table --region "$region" --vpc-id "$vpc_id" --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${vpc_name}-public-rt},{Key=Project,Value=${project}},{Key=Purpose,Value=proxy-public-egress}]" --query 'RouteTable.RouteTableId' --output text)"
  aws ec2 create-route --region "$region" --route-table-id "$public_route_table_id" --destination-cidr-block 0.0.0.0/0 --gateway-id "$igw_id" >/dev/null
  aws ec2 associate-route-table --region "$region" --route-table-id "$public_route_table_id" --subnet-id "$public_subnet_id" >/dev/null
fi

lambda_route_table_id="$(aws ec2 describe-route-tables --region "$region" --filters Name=vpc-id,Values="$vpc_id" Name=tag:Name,Values="${vpc_name}-lambda-rt" --query 'RouteTables[0].RouteTableId' --output text)"
if [[ -z "$lambda_route_table_id" || "$lambda_route_table_id" == "None" ]]; then
  lambda_route_table_id="$(aws ec2 create-route-table --region "$region" --vpc-id "$vpc_id" --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${vpc_name}-lambda-rt},{Key=Project,Value=${project}},{Key=Purpose,Value=lambda-private-no-nat}]" --query 'RouteTable.RouteTableId' --output text)"
  aws ec2 associate-route-table --region "$region" --route-table-id "$lambda_route_table_id" --subnet-id "$lambda_subnet_a_id" >/dev/null
  aws ec2 associate-route-table --region "$region" --route-table-id "$lambda_route_table_id" --subnet-id "$lambda_subnet_c_id" >/dev/null
fi

lambda_sg_id="$(aws ec2 describe-security-groups --region "$region" --filters Name=vpc-id,Values="$vpc_id" Name=tag:Name,Values="${vpc_name}-lambda-sg" --query 'SecurityGroups[0].GroupId' --output text)"
if [[ -z "$lambda_sg_id" || "$lambda_sg_id" == "None" ]]; then
  lambda_sg_id="$(aws ec2 create-security-group --region "$region" --group-name "${vpc_name}-lambda-sg" --description "Private scanner Lambda egress and AWS endpoint access" --vpc-id "$vpc_id" --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${vpc_name}-lambda-sg},{Key=Project,Value=${project}},{Key=Purpose,Value=lambda-private}]" --query GroupId --output text)"
  aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_sg_id" --ip-permissions IpProtocol=-1,IpRanges='[{CidrIp=0.0.0.0/0,Description=Scanner-egress}]' >/dev/null 2>&1 || true
fi

proxy_sg_id="$(aws ec2 describe-security-groups --region "$region" --filters Name=vpc-id,Values="$vpc_id" Name=tag:Name,Values="${vpc_name}-proxy-sg" --query 'SecurityGroups[0].GroupId' --output text)"
if [[ -z "$proxy_sg_id" || "$proxy_sg_id" == "None" ]]; then
  proxy_sg_id="$(aws ec2 create-security-group --region "$region" --group-name "${vpc_name}-proxy-sg" --description "California scanner proxy" --vpc-id "$vpc_id" --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${vpc_name}-proxy-sg},{Key=Project,Value=${project}},{Key=Purpose,Value=${purpose}}]" --query GroupId --output text)"
  aws ec2 authorize-security-group-ingress --region "$region" --group-id "$proxy_sg_id" --ip-permissions "IpProtocol=tcp,FromPort=3128,ToPort=3128,UserIdGroupPairs=[{GroupId=${lambda_sg_id},Description=Lambda-proxy}]" >/dev/null
  aws ec2 authorize-security-group-egress --region "$region" --group-id "$proxy_sg_id" --ip-permissions IpProtocol=-1,IpRanges='[{CidrIp=0.0.0.0/0,Description=Proxy-egress}]' >/dev/null 2>&1 || true
fi

endpoint_sg_id="$(aws ec2 describe-security-groups --region "$region" --filters Name=vpc-id,Values="$vpc_id" Name=tag:Name,Values="${vpc_name}-endpoint-sg" --query 'SecurityGroups[0].GroupId' --output text)"
if [[ -z "$endpoint_sg_id" || "$endpoint_sg_id" == "None" ]]; then
  endpoint_sg_id="$(aws ec2 create-security-group --region "$region" --group-name "${vpc_name}-endpoint-sg" --description "Private AWS service endpoints for scanner Lambda" --vpc-id "$vpc_id" --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${vpc_name}-endpoint-sg},{Key=Project,Value=${project}},{Key=Purpose,Value=private-service-endpoints}]" --query GroupId --output text)"
  aws ec2 authorize-security-group-ingress --region "$region" --group-id "$endpoint_sg_id" --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,UserIdGroupPairs=[{GroupId=${lambda_sg_id},Description=Lambda-endpoints}]" >/dev/null
  aws ec2 authorize-security-group-egress --region "$region" --group-id "$endpoint_sg_id" --ip-permissions IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges='[{CidrIp=0.0.0.0/0,Description=Endpoint-egress}]' >/dev/null 2>&1 || true
fi

# Lambda may reach the public internet only through the regional Squid proxy.
# AWS control-plane traffic stays on the private endpoints/S3 gateway and DNS
# is limited to the VPC resolver range.
aws ec2 revoke-security-group-egress --region "$region" --group-id "$lambda_sg_id" --ip-permissions IpProtocol=-1,IpRanges='[{CidrIp=0.0.0.0/0}]' >/dev/null 2>&1 || true
aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_sg_id" --ip-permissions "IpProtocol=tcp,FromPort=3128,ToPort=3128,UserIdGroupPairs=[{GroupId=${proxy_sg_id},Description=Scanner-proxy-only}]" >/dev/null 2>&1 || true
aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_sg_id" --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,UserIdGroupPairs=[{GroupId=${endpoint_sg_id},Description=Private-AWS-endpoints}]" >/dev/null 2>&1 || true
aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_sg_id" --ip-permissions "IpProtocol=udp,FromPort=53,ToPort=53,IpRanges=[{CidrIp=${vpc_cidr},Description=VPC-DNS}]" >/dev/null 2>&1 || true
aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_sg_id" --ip-permissions "IpProtocol=tcp,FromPort=53,ToPort=53,IpRanges=[{CidrIp=${vpc_cidr},Description=VPC-DNS-TCP}]" >/dev/null 2>&1 || true
s3_prefix_list_id="$(aws ec2 describe-managed-prefix-lists --region "$region" --filters Name=prefix-list-name,Values="com.amazonaws.${region}.s3" --query 'PrefixLists[0].PrefixListId' --output text)"
if [[ -n "$s3_prefix_list_id" && "$s3_prefix_list_id" != "None" ]]; then
  aws ec2 authorize-security-group-egress --region "$region" --group-id "$lambda_sg_id" --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=${s3_prefix_list_id},Description=S3-gateway}]" >/dev/null 2>&1 || true
fi

proxy_instance_id="$(aws ec2 describe-instances --region "$region" --filters Name=vpc-id,Values="$vpc_id" Name=tag:Name,Values="certscore-us-ca-proxy-t4g-micro" Name=instance-state-name,Values=pending,running,stopping,stopped --query 'Reservations[0].Instances[0].InstanceId' --output text)"
allocation_id="$(aws ec2 describe-addresses --region "$region" --filters Name=tag:Name,Values="certscore-us-ca-proxy-eip" --query 'Addresses[0].AllocationId' --output text)"
if [[ -z "$proxy_instance_id" || "$proxy_instance_id" == "None" ]]; then
  ami_id="$(aws ssm get-parameter --region "$region" --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-arm64 --query 'Parameter.Value' --output text)"
  user_data="$(sed -e "s|__CERTSCORE_VISIBLE_HOSTNAME__|certscore-us-ca-proxy|g" -e "s|__CERTSCORE_LAMBDA_VPC_CIDR__|${vpc_cidr}|g" "$template_path")"
  proxy_instance_id="$(aws ec2 run-instances --region "$region" --image-id "$ami_id" --instance-type t4g.micro --credit-specification CpuCredits=unlimited --subnet-id "$public_subnet_id" --security-group-ids "$proxy_sg_id" --associate-public-ip-address --metadata-options HttpTokens=required,HttpPutResponseHopLimit=1,HttpEndpoint=enabled --user-data "$user_data" --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=certscore-us-ca-proxy-t4g-micro},{Key=Project,Value=${project}},{Key=Purpose,Value=${purpose}},{Key=CertScoreProxyConfig,Value=us-ca-vpc-v1}]" --query 'Instances[0].InstanceId' --output text)"
  aws ec2 wait instance-running --region "$region" --instance-ids "$proxy_instance_id"
fi
if [[ -z "$allocation_id" || "$allocation_id" == "None" ]]; then
  allocation_id="$(aws ec2 allocate-address --region "$region" --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=certscore-us-ca-proxy-eip},{Key=Project,Value=${project}},{Key=Purpose,Value=${purpose}},{Key=Region,Value=California}]" --query AllocationId --output text)"
fi
aws ec2 associate-address --region "$region" --instance-id "$proxy_instance_id" --allocation-id "$allocation_id" >/dev/null

private_ip="$(aws ec2 describe-instances --region "$region" --instance-ids "$proxy_instance_id" --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text)"
public_ip="$(aws ec2 describe-addresses --region "$region" --allocation-ids "$allocation_id" --query 'Addresses[0].PublicIp' --output text)"

printf 'VPC_ID=%s\nPUBLIC_SUBNET_ID=%s\nLAMBDA_SUBNET_A_ID=%s\nLAMBDA_SUBNET_C_ID=%s\nLAMBDA_ROUTE_TABLE_ID=%s\nLAMBDA_SECURITY_GROUP_ID=%s\nENDPOINT_SECURITY_GROUP_ID=%s\nPROXY_INSTANCE_ID=%s\nPROXY_PRIVATE_IP=%s\nPROXY_PUBLIC_IP=%s\nPROXY_ALLOCATION_ID=%s\n' \
  "$vpc_id" "$public_subnet_id" "$lambda_subnet_a_id" "$lambda_subnet_c_id" "$lambda_route_table_id" "$lambda_sg_id" "$endpoint_sg_id" "$proxy_instance_id" "$private_ip" "$public_ip" "$allocation_id"
