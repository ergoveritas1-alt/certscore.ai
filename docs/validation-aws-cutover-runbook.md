# Validation AWS Cutover Runbook

This runbook defines the active AWS ECS + ElastiCache validation queue lane under [infra/aws/validation](/Users/benmasek/WC01/infra/aws/validation).

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
   - generated validation Redis secret ARN

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
2. Remove `VALIDATION_REDIS_URL` from the primary public web deployment so validation BullMQ is no longer reachable from the main app.
3. Keep `REDIS_URL` scoped to non-validation web needs only. The main web validation queue path now requires `VALIDATION_REDIS_URL` explicitly and does not fall back to `REDIS_URL`.
4. Confirm `/app/validation`, `/app/validation/scans`, and `/app/validation/issues` on the main app now send admins to the dedicated validation ops host instead of exposing local queue controls.
5. Confirm public preview/full scans still queue normally even when validation-side nano enrichment is unavailable; those sidecars should degrade gracefully instead of failing scan creation.
6. Run `pnpm check-env:validation-cutover` against both environments:
   - on the main app it should fail if `VALIDATION_REDIS_URL` is still present
   - on the validation ops host it should fail if `VALIDATION_REDIS_URL`, `CERTSCORE_ADMIN_EMAILS`, or other required ops-host settings are missing

## 4. Validate AWS runtime health

Run these checks before treating the AWS lane as authoritative:

1. Open the validation ops host and confirm `/crawler` and `/app/validation` load.
2. Start a manual validation run from the AWS validation ops UI.
3. Confirm ECS logs show:
   - validation worker startup with the ElastiCache host
   - collect/rank job completion
   - no `ERR max number of clients reached`
4. Confirm the scheduler service remains healthy and does not duplicate claims.
5. Use ECS Exec when needed to verify:
   - `VALIDATION_REDIS_URL` is present
   - `rediss://` is in use
   - DNS/TLS reachability to ElastiCache is healthy

## 5. Remove Any Legacy Queue Consumers

Only after the AWS validation lane passes end-to-end:

1. Confirm no non-AWS worker is still consuming validation jobs.
2. Re-run three fresh validation sites from the AWS ops surface.
3. Verify the old Redis Cloud endpoint is no longer receiving validation traffic from either the main web app or any retired worker path.

## 6. Post-cutover cleanup

After AWS is stable:

1. Remove legacy worker-pool operations from the active validation runbook.
2. Rotate or delete the old Redis Cloud validation secret bindings.
3. Leave the old infrastructure disabled but recoverable until at least one more small production batch completes cleanly.
