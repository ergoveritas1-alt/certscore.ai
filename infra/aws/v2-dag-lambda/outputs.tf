output "regional_resources" {
  description = "Regional Lambda, result queue, DLQ, failure queue, and artifact bucket identifiers."
  value = {
    eu_central_1 = module.eu_central_1.resources
    eu_west_1    = module.eu_west_1.resources
    us_west_1    = module.us_west_1.resources
  }
}

output "scanner_role_arn" {
  value = aws_iam_role.scanner.arn
}

output "regional_vpc_endpoints" {
  description = "Per-region private AWS-service endpoint IDs. These outputs do not include or manage NAT gateways or Lambda subnet routes."
  value = {
    eu-central-1 = module.eu_central_1.vpc_endpoint_resources
    eu-west-1    = module.eu_west_1.vpc_endpoint_resources
    us-west-1    = module.us_west_1.vpc_endpoint_resources
  }
}
