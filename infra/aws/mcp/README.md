# Legacy AWS MCP ECS/Fargate Stack

This stack previously deployed `apps/mcp`, the CertScore Streamable HTTP MCP server, to a dedicated ECS/Fargate service and ALB for `https://mcp.certscore.ai`.

The active production MCP service now runs as a separate ECS service in `infra/aws/web-ecs`, behind the existing CertScore web ALB with host-based routing for `mcp.certscore.ai`. Keep `enable_dedicated_serving_layer = false` unless you intentionally need to recreate the old dedicated fallback.

It follows the same broad shape as the existing WC01 AWS ECS stacks:

- ECR image repository
- optional ECS/Fargate task and service
- optional ALB ingress with HTTPS
- task-definition secret injection
- GitHub Actions OIDC deploy role
- CloudWatch logs and target-health alarms

## Launch Shape

The service intentionally runs one task for launch because MCP stream sessions are stored in memory. Scaling beyond one task requires sticky sessions at the load balancer or an external session store.

The legacy dedicated serving layer is disabled by default:

```hcl
enable_dedicated_serving_layer = false
```

## Required Inputs

Provide real account values in a local `terraform.tfvars` file or equivalent Terraform variable source:

```hcl
existing_vpc_id          = "vpc-..."
public_subnet_ids        = ["subnet-...", "subnet-..."]
private_subnet_ids       = ["subnet-...", "subnet-..."]
existing_certificate_arn = "arn:aws:acm:us-west-2:...:certificate/..."
jwt_signing_secret_arn   = "arn:aws:secretsmanager:us-west-2:...:secret:..."
```

The active GitHub Actions workflow should target the shared web stack:

- secret `AWS_ROLE_TO_ASSUME`: web deploy role ARN
- variable `AWS_MCP_REGION`: `us-west-1`
- variable `AWS_MCP_ECR_REPOSITORY`: `certscore-web-mcp`
- variable `AWS_MCP_ECS_CLUSTER`: `certscore-web-cluster`
- variable `AWS_MCP_ECS_SERVICE`: `certscore-web-mcp`
- variable `AWS_MCP_ECS_CONTAINER`: `mcp-http`
- variable `AWS_MCP_ECS_LOG_GROUP`: `/ecs/certscore-web/mcp`
- variable `AWS_MCP_TARGET_GROUP_ARN`: shared web-stack MCP target group ARN

## Cloudflare Steps

For the active shared-ALB deployment, keep this manually in Cloudflare:

1. `CNAME mcp.certscore.ai -> certscore-web-alb-527275258.us-west-1.elb.amazonaws.com`, proxied.
2. Keep SSL/TLS mode on Full or Full Strict.
3. Add a cache rule for `mcp.certscore.ai/*` that bypasses cache.
4. Disable transformations/performance features for `mcp.certscore.ai/*` that could buffer or alter streaming responses.
5. Purge Cloudflare cache for `mcp.certscore.ai`.

Verify streaming with:

```bash
curl -N https://mcp.certscore.ai/mcp
```

Authenticated stream checks should stay open for more than 120 seconds and show `:ka` keepalive comments.
