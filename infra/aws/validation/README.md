# AWS Validation Stack

This Terraform stack provisions the AWS-only validation queue lane:

- ECS/Fargate cluster for:
  - validation ops web (`apps/web` with `APP_FLAVOR=validation_ops`)
  - validation worker
  - validation scheduler
- private ElastiCache Redis OSS replication group with TLS and AUTH enabled
- ALB, Route53, and optional ACM DNS validation for the validation ops hostname
- ECR repositories for the web and worker images
- Secrets Manager secret for the generated `VALIDATION_REDIS_URL`

## Expected inputs

- existing Secrets Manager ARNs for database/auth/OpenAI/S3 secrets
- `validation_domain_name` and `hosted_zone_id` for the public validation hostname
- shared S3 bucket details

## Apply flow

1. Copy [terraform.tfvars.example](/Users/benmasek/WC01/infra/aws/validation/terraform.tfvars.example) to `terraform.tfvars`.
2. Fill in the real secret ARNs, DNS, and sizing values.
3. Run:

```bash
cd infra/aws/validation
terraform init
terraform plan
terraform apply
```

4. Capture the outputs for:
   - `validation_ops_base_url`
   - `ecs_cluster_name`
   - `ecs_web_service_name`
   - `ecs_worker_service_name`
   - `ecs_scheduler_service_name`
   - `github_actions_deploy_role_arn`
   - `web_ecr_repository_url`
   - `worker_ecr_repository_url`
   - `validation_redis_secret_arn`

5. Configure the GitHub Actions AWS deploy workflow with those output values.

Required repository configuration for `.github/workflows/validation-aws-deploy.yml`:

- GitHub secret:
  - `AWS_ROLE_TO_ASSUME`
    Set this to the Terraform output `github_actions_deploy_role_arn`.
- GitHub variables:
  - `AWS_REGION`
  - `AWS_VALIDATION_OPS_BASE_URL`
  - `AWS_VALIDATION_WEB_ECR_REPOSITORY`
  - `AWS_VALIDATION_WORKER_ECR_REPOSITORY`
  - `AWS_VALIDATION_ECS_CLUSTER`
  - `AWS_VALIDATION_ECS_WEB_SERVICE`
  - `AWS_VALIDATION_ECS_WORKER_SERVICE`
  - `AWS_VALIDATION_ECS_SCHEDULER_SERVICE`

## Notes

- This stack intentionally uses a standard node-based ElastiCache replication group, not serverless, because the validation queue lane uses BullMQ.
- The main Vercel app can point admins at the resulting `validation_ops_base_url` with `VALIDATION_OPS_BASE_URL` while the validation ECS tasks consume the generated `VALIDATION_REDIS_URL` secret directly.
- The stack now creates the GitHub OIDC provider and a dedicated deploy role for this repository. Tighten `github_actions_subjects` if you want to restrict assumption to only `main` or a narrower workflow pattern.
