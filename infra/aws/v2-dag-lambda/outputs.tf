output "regional_resources" {
  description = "Regional Lambda, result queue, DLQ, failure queue, and artifact bucket identifiers."
  value = {
    eu_central_1 = module.eu_central_1.resources
    eu_west_1    = module.eu_west_1.resources
    us_west_2    = module.us_west_2.resources
  }
}

output "scanner_role_arn" {
  value = aws_iam_role.scanner.arn
}
