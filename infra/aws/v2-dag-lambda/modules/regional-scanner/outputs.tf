output "resources" {
  value = {
    artifact_bucket         = aws_s3_bucket.artifacts.id
    async_failure_queue_url = aws_sqs_queue.async_failures.url
    function_arn            = aws_lambda_function.scanner.arn
    repository_url          = aws_ecr_repository.scanner.repository_url
    result_dlq_url          = aws_sqs_queue.result_dlq.url
    result_queue_url        = aws_sqs_queue.results.url
  }
}
