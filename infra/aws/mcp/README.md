# AWS MCP ECS/Fargate Stack

This stack deploys `apps/mcp`, the CertScore Streamable HTTP MCP server, to ECS/Fargate behind an ALB for `https://mcp.certscore.ai`.

It follows the same broad shape as the existing WC01 AWS ECS stacks:

- ECR image repository
- ECS/Fargate task and service
- ALB ingress with HTTPS
- task-definition secret injection
- GitHub Actions OIDC deploy role
- CloudWatch logs and target-health alarms

## Launch Shape

The service intentionally runs one task for launch because MCP stream sessions are stored in memory. Scaling beyond one task requires sticky sessions at the load balancer or an external session store.

## Required Inputs

Provide real account values in a local `terraform.tfvars` file or equivalent Terraform variable source:

```hcl
existing_vpc_id          = "vpc-..."
public_subnet_ids        = ["subnet-...", "subnet-..."]
private_subnet_ids       = ["subnet-...", "subnet-..."]
existing_certificate_arn = "arn:aws:acm:us-west-2:...:certificate/..."
jwt_signing_secret_arn   = "arn:aws:secretsmanager:us-west-2:...:secret:..."
```

The GitHub Actions workflow needs these repository settings after `terraform apply`:

- secret `AWS_ROLE_TO_ASSUME`: `github_actions_deploy_role_arn`
- variable `AWS_MCP_ECR_REPOSITORY`: `ecr_repository_name`
- variable `AWS_MCP_ECS_CLUSTER`: `ecs_cluster_name`
- variable `AWS_MCP_ECS_SERVICE`: `ecs_service_name`
- variable `AWS_MCP_ECS_CONTAINER`: `mcp-http`
- variable `AWS_MCP_ECS_LOG_GROUP`: `log_group_name`
- variable `AWS_MCP_TARGET_GROUP_ARN`: `target_group_arn`

## Cloudflare Steps

After Terraform creates the ALB, add these manually in Cloudflare:

1. Add `CNAME mcp.certscore.ai -> <alb_dns_name>` and leave it proxied.
2. Keep SSL/TLS mode on Full or Full Strict.
3. Add a cache rule for `mcp.certscore.ai/*` that bypasses cache.
4. Disable transformations/performance features for `mcp.certscore.ai/*` that could buffer or alter streaming responses.
5. Purge Cloudflare cache for `mcp.certscore.ai`.

Verify streaming with:

```bash
curl -N https://mcp.certscore.ai/mcp
```

Authenticated stream checks should stay open for more than 120 seconds and show `:ka` keepalive comments.
