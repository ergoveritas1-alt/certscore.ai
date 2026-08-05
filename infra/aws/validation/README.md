# AWS Validation Stack

This Terraform stack provisions the AWS-only validation worker lane and retains
the inactive validation ops recovery infrastructure during retirement:

- ECS/Fargate cluster and service for the validation worker
- an inactive validation ops task definition for bounded recovery only; the
  retired ops-web ECS service is intentionally absent
- temporarily retained ALB, Route53, and optional ACM infrastructure for the
  retired validation ops hostname
- ECR repositories for the web and worker images

## Expected inputs

- existing Secrets Manager ARNs for database/auth/OpenAI/S3 secrets
- `validation_domain_name` and `hosted_zone_id` for the public validation hostname
- shared S3 bucket details

## Apply flow

1. Copy `backend.hcl.example` outside the repository and configure the
   encrypted, versioned Terraform state bucket.
2. Copy [terraform.tfvars.example](/Users/benmasek/WC01/infra/aws/validation/terraform.tfvars.example) to `terraform.tfvars`.
3. Fill in the real secret ARNs, DNS, and sizing values.
4. Run:

```bash
cd infra/aws/validation
terraform init -backend-config=/secure/path/validation.backend.hcl
terraform plan
terraform apply
```

5. Capture the outputs for:
   - `validation_ops_base_url`
   - `ecs_cluster_name`
   - `ecs_worker_service_name`
   - `github_actions_deploy_role_arn`
   - `web_ecr_repository_url`
   - `worker_ecr_repository_url`

6. Configure the GitHub Actions AWS deploy workflow with those output values.

Required repository configuration for `.github/workflows/validation-aws-deploy.yml`:

- GitHub secret:
  - `AWS_ROLE_TO_ASSUME`
    Set this to the Terraform output `github_actions_deploy_role_arn`.
- GitHub variables:
  - `AWS_REGION`
  - `AWS_VALIDATION_WORKER_ECR_REPOSITORY`
  - `AWS_VALIDATION_ECS_CLUSTER`
  - `AWS_VALIDATION_ECS_WORKER_SERVICE`

## Notes

- The validation worker lane is Postgres-backed.
- AWS S3 access uses the ECS task role. Static S3 secret ARNs are reserved for
  non-AWS S3-compatible development storage and should stay empty in AWS.
- The account-wide GitHub Actions OIDC provider is owned by the web stack and
  passed here through `github_actions_oidc_provider_arn`. If an older validation
  state still tracks that same provider, remove only its Terraform state address
  before planning this version; do not delete the live account-wide provider.
- `validation_ops_base_url`, the ALB, and the web task definition are retained
  recovery artifacts; no ECS service currently serves that URL.
- The stack creates the GitHub OIDC provider and a dedicated deploy role whose
  default trust is restricted to `main`. Prefer a protected GitHub production
  environment subject when the deployment workflow adopts environment gates.
