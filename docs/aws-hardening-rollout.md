# AWS Hardening Rollout

This runbook applies the repository hardening changes without conflating state
migration, MCP service isolation, credential rotation, and network cleanup.

## Preconditions

- Use Node 20 or 22 and Terraform 1.6 or newer.
- Capture `terraform state pull` backups for both stacks.
- Create or select a private, encrypted, versioned S3 Terraform-state bucket.
- Confirm the current web and MCP public health checks pass.
- Capture the current three-region scanner Lambda configuration, image digests,
  result queues, artifact buckets, VPC attachments, and proxy/egress variables.

## 1. Migrate Terraform state

Configure private copies of each `backend.hcl.example`, then migrate one stack
at a time:

```bash
terraform -chdir=infra/aws/web-ecs init -migrate-state -backend-config=/secure/path/web-ecs.backend.hcl
terraform -chdir=infra/aws/validation init -migrate-state -backend-config=/secure/path/validation.backend.hcl
```

Pull the remote state after migration and confirm its lineage and serial match
the local backup before planning infrastructure changes.

## 2. Establish one GitHub OIDC provider owner

The web stack owns the account-wide GitHub Actions OIDC provider. Set
`github_actions_oidc_provider_arn` in validation tfvars to the web stack output.

If the older validation state also tracks the same live provider, remove only
that duplicate state address before planning:

```bash
terraform -chdir=infra/aws/validation state rm aws_iam_openid_connect_provider.github_actions
```

Do not delete the live provider. Confirm the validation plan changes only its
role trust reference and does not propose provider deletion.

## 3. Create the isolated MCP service before switching traffic

Create the new target group, task role, task definition, and single-task service
while the legacy sidecar still serves traffic:

```bash
terraform -chdir=infra/aws/web-ecs apply \
  -target=aws_lb_target_group.mcp_service \
  -target=aws_iam_role.mcp_task \
  -target=aws_iam_role_policy.mcp_task_exec \
  -target=aws_ecs_task_definition.mcp \
  -target=aws_ecs_service.mcp
```

The service dependency creates a non-public `mcp-staging.invalid` listener rule
so ECS can register targets without moving production traffic. Verify the new
target group has one healthy target. Then run a normal plan and apply. The
normal apply moves `mcp.certscore.ai` to the isolated target group and removes
the sidecar from the web task definition.

Set the GitHub repository variable:

```text
AWS_MCP_ECS_SERVICE=certscore-web-mcp
```

Run the MCP deployment workflow and its authenticated session checks. Do not
increase MCP desired count while its protocol sessions remain process-resident.

The legacy `certscore-web-mcp` target group is intentionally retained during
this rollout. Remove its Terraform resource and delete the unused target group
in a later reviewed cleanup after rollback confidence is established.

## 4. Move S3 access to task roles

Deploy the updated web and validation task definitions with both static S3
secret ARN variables empty. Verify bucket access, signed download URLs, upload,
and delete behavior through the application and validation runtime checks.

After the verification window, disable and then remove the old IAM access key
and its Secrets Manager values. Preserve explicit credentials only for local or
non-AWS S3-compatible endpoints.

## 5. Enable edge controls deliberately

The example enables WAF. The source-IP rate rule blocks above the configured
threshold; the AWS common managed rule group initially counts only. Review WAF
sampled requests before changing managed rules to blocking.

Create an ALB log bucket with the regional ELB log-delivery policy before
setting `alb_access_logs_bucket`. Verify log objects arrive under the configured
prefix and have the intended retention policy.

## 6. Validation network follow-up

The validation stack now fails planning when an enabled ALB-backed validation
web task is placed in a different VPC from its target group. The current
worker-only cross-VPC subnet override remains supported while validation ops web
desired count is zero.

Consolidating the remaining validation worker and database networking requires
a separately reviewed live-state migration. Do not destroy the existing
validation VPC, NAT gateway, or routes until the worker has proven database,
S3, SQS, and outbound browser connectivity from the chosen production subnets.

## 7. Adopt the production scanner stack

WS01 explicitly prohibits production scanner deployment. The production v2 DAG
Lambda runtime is therefore managed in WC01 under `infra/aws/v2-dag-lambda`.

Follow that stack's import runbook before applying it. Preserve every existing
regional browser, proxy, egress, and VPC value. The first plan must not replace a
Lambda, detach it from its VPC, remove runtime variables, or delete retained
evidence. Add the result-ingestion DLQ, reserved concurrency, log retention, and
alarms one region at a time, verifying a canary and regional parity after each.

Once imported, routine scanner deploys update code with a digest-qualified ECR
image only. Infrastructure creation and configuration changes go through the
Terraform stack and a reviewed plan.
