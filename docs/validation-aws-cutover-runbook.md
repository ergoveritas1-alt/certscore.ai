# Validation AWS Cutover Runbook

This runbook defines the active AWS validation runtime lane under [infra/aws/validation](/Users/benmasek/WC01/infra/aws/validation).

## 1. Prepare AWS infrastructure

1. Fill out [infra/aws/validation/terraform.tfvars.example](/Users/benmasek/WC01/infra/aws/validation/terraform.tfvars.example) as `terraform.tfvars`.
2. Apply the stack:

```bash
cd infra/aws/validation
terraform init
terraform plan
terraform apply
```

3. Record the outputs:
   - validation ops base URL
   - ECS cluster name
   - ECS web/worker/scheduler service names
   - ECR repository URLs

## 2. Configure GitHub Actions

Set these GitHub repository values before the first AWS deploy:

- secret `AWS_ROLE_TO_ASSUME`
- variable `AWS_REGION`
- variable `AWS_VALIDATION_OPS_BASE_URL`
- variable `AWS_VALIDATION_WEB_ECR_REPOSITORY`
- variable `AWS_VALIDATION_WORKER_ECR_REPOSITORY`
- variable `AWS_VALIDATION_ECS_CLUSTER`
- variable `AWS_VALIDATION_ECS_WEB_SERVICE`
- variable `AWS_VALIDATION_ECS_WORKER_SERVICE`
- variable `AWS_VALIDATION_ECS_SCHEDULER_SERVICE`

The role behind `AWS_ROLE_TO_ASSUME` must also be allowed to push to both validation ECR repositories:

- `certscore-validation-ops-web`
- `certscore-validation-worker`

Push to `main` or manually dispatch `Validation AWS Deploy`.

## 3. Switch the main app to the dedicated validation host

1. Set `VALIDATION_OPS_BASE_URL` on the primary public web deployment to the AWS validation ops hostname.
2. Confirm `/app/validation`, `/app/validation/scans`, and `/app/validation/issues` on the main app now send admins to the dedicated validation ops host instead of exposing local validation controls.
3. Confirm public preview/full scans still queue normally even when validation-side nano enrichment is unavailable; those sidecars should degrade gracefully instead of failing scan creation.
4. Run `pnpm check-env:validation-cutover` against both environments:
   - on the main app it should fail if `VALIDATION_OPS_BASE_URL` is missing or points back to the main host
   - on the validation ops host it should fail if `CERTSCORE_ADMIN_EMAILS` or other required ops-host settings are missing

## 4. Validate AWS runtime health

Run these checks before treating the AWS lane as authoritative:

1. Open the validation ops host and confirm `/crawler` and `/app/validation` load.
2. Start a manual validation run from the AWS validation ops UI.
3. Confirm ECS logs show:
   - validation worker startup
   - collect/rank job completion
4. Confirm the scheduler service remains healthy and does not duplicate claims.
5. Use ECS Exec when needed to verify the worker and scheduler task definitions contain the expected runtime env and can reach PostgreSQL, storage, and external dependencies.

## 5. Remove Any Legacy Queue Consumers

Only after the AWS validation lane passes end-to-end:

1. Confirm no non-AWS worker is still consuming validation jobs.
2. Re-run three fresh validation sites from the AWS ops surface.

## 6. Post-cutover cleanup

After AWS is stable:

1. Remove legacy worker-pool operations from the active validation runbook.
2. Leave the old infrastructure disabled but recoverable until at least one more small production batch completes cleanly.
