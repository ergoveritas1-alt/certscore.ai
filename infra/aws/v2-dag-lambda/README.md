# CertScore v2 DAG Lambda infrastructure

This stack owns the production scanner runtime in `eu-central-1`, `eu-west-1`,
and `us-west-2`. WS01 is not a production deployment target.

It manages the shared Lambda role and, in every region:

- the scanner ECR repository and untagged-image retention;
- the retained-evidence S3 bucket with public access blocked, encryption,
  versioning, and incomplete-upload cleanup;
- the result queue, result-ingestion DLQ, and async-invocation failure queue;
- the Lambda configuration, reserved concurrency, log retention, and async
  failure destination;
- alarms for Lambda errors/throttles, stale results, result DLQ messages, and
  async failures.

Routine `deploy:scanners` releases update Lambda code with a digest-qualified
regional image. Terraform deliberately ignores only `image_uri`; it remains
authoritative for runtime configuration and infrastructure.

Before building or promoting a scanner image, `deploy:scanners` applies the
Terraform-authoritative 3008 MB memory setting with a scoped Lambda
configuration update in all three regions. It waits for each function to become
active and verifies the configured memory before any `update-function-code`
call. The scoped update intentionally preserves each region's existing VPC,
proxy, environment, and retained-evidence configuration.

The production account currently rejects larger values with an AWS Lambda
`MemorySize` validation maximum of 3008 MB. Keep the pre-image convergence gate
at that live ceiling unless AWS raises the account's accepted limit; do not let
an unavailable memory target block an otherwise evidence-preserving release.

The imported result and async-failure queues currently use AWS's 1 MiB message
limit. AWS provider v5 still validates the historical 256 KiB maximum, so this
stack temporarily ignores `max_message_size` on those two imported queues. The
new result DLQ uses the provider default. Remove that exception after upgrading
the stack to a provider version that models the live AWS limit.

## Import the live resources without replacement

Do not apply this stack to production before importing the existing resources.
First inventory each Lambda's environment, VPC attachment, memory, role, queues,
buckets, and image digest. Populate a private `terraform.tfvars` from
`terraform.tfvars.example`, preserving all proxy and egress variables exactly.
Use digest-qualified regional image URIs.

Initialize remote state:

```bash
terraform -chdir=infra/aws/v2-dag-lambda init \
  -migrate-state \
  -backend-config=/secure/path/v2-dag-lambda.backend.hcl
```

Import the global IAM resources:

```bash
terraform -chdir=infra/aws/v2-dag-lambda import aws_iam_role.scanner certscore-v2-dag-local-role
terraform -chdir=infra/aws/v2-dag-lambda import aws_iam_role_policy.scanner certscore-v2-dag-local-role:certscore-v2-dag-local-policy
```

For each module key and AWS region below, import the existing resources. The
result-ingestion DLQ, redrive policy, alarms, S3 versioning configuration, and
ECR lifecycle policy are expected additions; import them only if they already
exist.

| Module | Region |
|---|---|
| `eu_central_1` | `eu-central-1` |
| `eu_west_1` | `eu-west-1` |
| `us_west_2` | `us-west-2` |

Example for `eu-central-1` (repeat with the matching module and region):

```bash
terraform -chdir=infra/aws/v2-dag-lambda import 'module.eu_central_1.aws_ecr_repository.scanner' certscore-v2-dag-local-lambda
terraform -chdir=infra/aws/v2-dag-lambda import 'module.eu_central_1.aws_s3_bucket.artifacts' certscore-v2-dag-local-artifacts-eu-central-1-ACCOUNT_ID
terraform -chdir=infra/aws/v2-dag-lambda import 'module.eu_central_1.aws_s3_bucket_public_access_block.artifacts' certscore-v2-dag-local-artifacts-eu-central-1-ACCOUNT_ID
terraform -chdir=infra/aws/v2-dag-lambda import 'module.eu_central_1.aws_s3_bucket_server_side_encryption_configuration.artifacts' certscore-v2-dag-local-artifacts-eu-central-1-ACCOUNT_ID
terraform -chdir=infra/aws/v2-dag-lambda import 'module.eu_central_1.aws_sqs_queue.results' 'https://sqs.eu-central-1.amazonaws.com/ACCOUNT_ID/certscore-v2-dag-local-production-results'
terraform -chdir=infra/aws/v2-dag-lambda import 'module.eu_central_1.aws_sqs_queue.async_failures' 'https://sqs.eu-central-1.amazonaws.com/ACCOUNT_ID/certscore-v2-dag-local-async-failures'
terraform -chdir=infra/aws/v2-dag-lambda import 'module.eu_central_1.aws_cloudwatch_log_group.scanner' '/aws/lambda/certscore-v2-dag-local-lambda'
terraform -chdir=infra/aws/v2-dag-lambda import 'module.eu_central_1.aws_lambda_function.scanner' certscore-v2-dag-local-lambda
terraform -chdir=infra/aws/v2-dag-lambda import 'module.eu_central_1.aws_lambda_function_event_invoke_config.scanner' certscore-v2-dag-local-lambda
```

Run `terraform plan` and require that it proposes no Lambda replacement, no VPC
detachment, no proxy/egress variable removal, and no retained-evidence deletion.
Apply one region at a time with module targets during the first rollout. After
each region, run the regional parity check and a retained-evidence canary before
continuing.

The legacy `scripts/local-v2-dag-lambda/setup-dev-aws-image.sh` is retained only
for non-production local/dev bootstrapping. Production releases must use
`deploy:scanners`, which updates code only and cannot recreate infrastructure.
