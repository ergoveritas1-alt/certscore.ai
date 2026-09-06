output "resources" {
  value = {
    artifact_bucket         = aws_s3_bucket.artifacts.id
    async_failure_queue_url = aws_sqs_queue.async_failures.url
    dispatch_dlq_url        = aws_sqs_queue.dispatch_dlq.url
    dispatch_queue_arn      = aws_sqs_queue.dispatch.arn
    dispatch_queue_url      = aws_sqs_queue.dispatch.url
    function_arn            = aws_lambda_function.scanner.arn
    inventory_function_arn  = aws_lambda_function.inventory.arn
    repository_url          = aws_ecr_repository.scanner.repository_url
    result_dlq_url          = aws_sqs_queue.result_dlq.url
    result_queue_url        = aws_sqs_queue.results.url
  }
}

output "vpc_endpoint_resources" {
  description = "Private AWS service endpoint resources provisioned for the regional scanner, or null when not configured."
  value = {
    endpoint_security_group_id = try(aws_security_group.vpc_endpoints[0].id, null)
    lambda_endpoint_id         = try(aws_vpc_endpoint.lambda[0].id, null)
    logs_endpoint_id           = try(aws_vpc_endpoint.logs[0].id, null)
    s3_gateway_endpoint_id     = try(aws_vpc_endpoint.s3[0].id, null)
    sqs_endpoint_id            = try(aws_vpc_endpoint.sqs[0].id, null)
  }
}
