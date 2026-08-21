import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webTerraformPath = "infra/aws/web-ecs/main.tf";
const validationTerraformPath = "infra/aws/validation/main.tf";
const scannerTerraformPath = "infra/aws/v2-dag-lambda/modules/regional-scanner/main.tf";
const scannerRootTerraformPath = "infra/aws/v2-dag-lambda/main.tf";
const scannerRootVariablesPath = "infra/aws/v2-dag-lambda/variables.tf";
const scannerModuleVariablesPath = "infra/aws/v2-dag-lambda/modules/regional-scanner/variables.tf";

test("MCP uses an isolated single-task ECS service and task role", async () => {
  const source = await readFile(webTerraformPath, "utf8");
  const mcpService = source.match(/resource "aws_ecs_service" "mcp" \{[\s\S]*?\n\}/)?.[0] ?? "";
  const webTask = source.match(/resource "aws_ecs_task_definition" "certscore" \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(source, /resource "aws_ecs_task_definition" "mcp"/);
  assert.match(source, /resource "aws_iam_role" "mcp_task"/);
  assert.match(mcpService, /desired_count\s+=\s+1/);
  assert.match(mcpService, /deployment_maximum_percent\s+=\s+200/);
  assert.match(mcpService, /deployment_minimum_healthy_percent\s+=\s+100/);
  assert.doesNotMatch(webTask, /mcp-http/);
});

test("AWS ECS storage uses scoped task-role permissions and optional static credentials", async () => {
  for (const path of [webTerraformPath, validationTerraformPath]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /Sid\s+=\s+"UseSharedArtifactBucket"/);
    assert.match(source, /Sid\s+=\s+"ListSharedArtifactBucket"/);
    assert.match(source, /s3_access_key_id_secret_arn != "" && var\.s3_secret_access_key_secret_arn != ""/);
  }
});

test("GitHub deploy roles restrict PassRole to ECS task roles", async () => {
  for (const path of [webTerraformPath, validationTerraformPath]) {
    const source = await readFile(path, "utf8");
    const passRoleStatement = source.match(/Action\s+=\s+\["iam:PassRole"\][\s\S]*?\n\s+\}/)?.[0] ?? "";
    assert.ok(passRoleStatement.length > 0, `${path} must declare iam:PassRole`);
    assert.doesNotMatch(passRoleStatement, /Resource\s+=\s+"\*"/);
    assert.match(passRoleStatement, /"iam:PassedToService"\s+=\s+"ecs-tasks\.amazonaws\.com"/);
  }
});

test("validation deploy assumes its dedicated AWS role", async () => {
  const source = await readFile(".github/workflows/validation-aws-deploy.yml", "utf8");
  assert.match(source, /vars\.AWS_VALIDATION_ROLE_TO_ASSUME/);
  assert.match(source, /"apps\/web\/server\/\*\*"/);
  assert.match(source, /\.name != "S3_ACCESS_KEY_ID"/);
  assert.match(source, /\.name != "S3_SECRET_ACCESS_KEY"/);

  const terraform = await readFile(validationTerraformPath, "utf8");
  assert.match(terraform, /"logs:FilterLogEvents"/);
});

test("validation runtime-base rebuilds follow dependency inputs, not root script-only edits", async () => {
  const source = await readFile(".github/workflows/validation-aws-deploy.yml", "utf8");
  const classifier = source.match(
    /if git diff --name-only "\$\{base_ref\}" "\$\{GITHUB_SHA\}" \| grep -Eq '([^']+)'/,
  )?.[1] ?? "";

  assert.match(classifier, /apps\/validation-worker\/package\\\.json/);
  assert.match(classifier, /pnpm-lock\\\.yaml/);
  assert.doesNotMatch(classifier, /\|package\\\.json\|/);
});

test("validation deployment classifiers include web server dependencies compiled into the worker", async () => {
  const deploySource = await readFile("scripts/deploy-fast.ts", "utf8");
  const predeploySource = await readFile("scripts/predeploy.ts", "utf8");

  assert.match(deploySource, /file\.startsWith\("apps\/web\/server\/"\)/);
  assert.match(predeploySource, /file\.startsWith\("apps\/web\/server\/"\)/);
});

test("production ops monitor assumes the validation role for ECS probes", async () => {
  const source = await readFile(".github/workflows/prod-ops-monitor.yml", "utf8");

  assert.match(
    source,
    /AWS_ROLE_TO_ASSUME: \$\{\{ vars\.AWS_VALIDATION_ROLE_TO_ASSUME \|\| secrets\.AWS_ROLE_TO_ASSUME \}\}/
  );
});

test("validation worker uses the measured low-utilization Fargate size", async () => {
  const workflow = await readFile(".github/workflows/validation-aws-deploy.yml", "utf8");
  const variables = await readFile("infra/aws/validation/variables.tf", "utf8");
  assert.match(workflow, /ECS_WORKER_CPU: "256"/);
  assert.match(workflow, /ECS_WORKER_MEMORY: "512"/);
  assert.match(variables, /variable "worker_cpu"[\s\S]*?default\s+=\s+256/);
  assert.match(variables, /variable "worker_memory"[\s\S]*?default\s+=\s+512/);
});

test("report materialization uses an isolated full-vCPU task definition", async () => {
  const workflow = await readFile(".github/workflows/web-aws-ecs-deploy.yml", "utf8");
  const terraform = await readFile(webTerraformPath, "utf8");
  const materializerService = terraform.match(
    /resource "aws_ecs_service" "materializer" \{[\s\S]*?\n\}/,
  )?.[0] ?? "";

  assert.match(workflow, /MATERIALIZER_TASK_CPU: \$\{\{ vars\.AWS_WEB_MATERIALIZER_TASK_CPU \|\| '1024' \}\}/);
  assert.match(workflow, /MATERIALIZER_TASK_MEMORY: \$\{\{ vars\.AWS_WEB_MATERIALIZER_TASK_MEMORY \|\| '2048' \}\}/);
  assert.match(workflow, /\.family = \(\.family \+ "-materializer"\)/);
  assert.match(workflow, /--task-definition "\$\{TARGET_MATERIALIZER_TASK_DEFINITION\}"/);
  assert.match(materializerService, /ignore_changes\s+=\s+\[task_definition\]/);
});

test("retired validation ops web service stays absent", async () => {
  const source = await readFile(validationTerraformPath, "utf8");
  assert.doesNotMatch(source, /resource "aws_ecs_service" "web"/);
  assert.match(source, /resource "aws_ecs_task_definition" "web"/);
  assert.match(source, /resource "aws_ecs_service" "worker"/);
});

test("Terraform stacks use a partial remote S3 backend", async () => {
  for (const path of [
    "infra/aws/web-ecs/versions.tf",
    "infra/aws/validation/versions.tf",
    "infra/aws/v2-dag-lambda/versions.tf"
  ]) {
    assert.match(await readFile(path, "utf8"), /backend "s3" \{\}/);
  }
});

test("scanner Lambda infrastructure is bounded and failure-aware", async () => {
  const source = await readFile(scannerTerraformPath, "utf8");
  assert.match(source, /resource "aws_sqs_queue" "result_dlq"/);
  assert.match(source, /redrive_policy\s+=\s+jsonencode/);
  assert.match(source, /sqs_managed_sse_enabled\s+=\s+true/);
  assert.match(source, /reserved_concurrent_executions\s+=\s+var\.reserved_concurrent_executions/);
  assert.match(source, /resource "aws_cloudwatch_metric_alarm" "old_results"/);
  assert.match(source, /resource "aws_cloudwatch_metric_alarm" "result_dlq"/);
  assert.match(source, /resource "aws_cloudwatch_metric_alarm" "lambda_duration_warning"/);
  assert.match(source, /alarm_name\s+=\s+"\$\{var\.function_name\}-\$\{var\.region\}-duration-60s"/);
  assert.match(source, /metric_name\s+=\s+"Duration"/);
  assert.match(source, /statistic\s*=\s*"Maximum"/);
  assert.match(source, /period\s*=\s*60/);
  assert.match(source, /threshold\s*=\s*60000/);
  assert.match(source, /v2_lambda_duration_warning/);
  assert.match(source, /aws_request_id/);
  assert.match(source, /scan_id/);
  assert.match(source, /timeout\s+=\s+75/);
  assert.match(source, /resource "aws_s3_bucket_versioning" "artifacts"/);
  assert.match(source, /CERTSCORE_V2_DAG_LAMBDA_REQUIRE_REGIONAL_EGRESS\s+=\s+"true"/);
});

test("regional scanner dispatch is durable, deduplicated, and production-wired", async () => {
  const [scannerModule, scannerRoot, validation, validationWorkflow] = await Promise.all([
    readFile(scannerTerraformPath, "utf8"),
    readFile("infra/aws/v2-dag-lambda/main.tf", "utf8"),
    readFile("infra/aws/validation/main.tf", "utf8"),
    readFile(".github/workflows/validation-aws-deploy.yml", "utf8"),
  ]);

  assert.match(scannerModule, /resource "aws_sqs_queue" "dispatch"/);
  assert.match(scannerModule, /fifo_queue\s+=\s+true/);
  assert.match(scannerModule, /visibility_timeout_seconds\s+=\s+900/);
  assert.match(scannerModule, /maxReceiveCount\s+=\s+5/);
  assert.match(scannerModule, /resource "aws_lambda_event_source_mapping" "dispatch"/);
  assert.match(scannerModule, /batch_size\s+=\s+1/);
  assert.match(scannerModule, /resource "aws_cloudwatch_metric_alarm" "dispatch_dlq"/);
  assert.match(scannerRoot, /Sid\s+=\s+"ConsumeRegionalScannerDispatches"/);
  assert.match(validation, /Sid\s+=\s+"PublishRegionalV2DagLambdaDispatches"/);
  assert.match(validation, /CERTSCORE_V2_DAG_LAMBDA_DISPATCH_PUBLISH_ENABLED/);
  assert.match(validationWorkflow, /VALIDATION_WORKER_LAMBDA_DISPATCH_PUBLISH_ENABLED: "1"/);
  assert.match(validationWorkflow, /CERTSCORE_V2_DAG_LAMBDA_EU_DE_DISPATCH_QUEUE_URL/);
  assert.match(validationWorkflow, /CERTSCORE_V2_DAG_LAMBDA_EU_IE_DISPATCH_QUEUE_URL/);
  assert.match(validationWorkflow, /CERTSCORE_V2_DAG_LAMBDA_US_WEST_DISPATCH_QUEUE_URL/);
});

test("scanner NAT-free AWS service endpoints are private, scoped, and migration-safe", async () => {
  const source = await readFile(scannerTerraformPath, "utf8");
  const root = await readFile(scannerRootTerraformPath, "utf8");
  const variables = await readFile(scannerRootVariablesPath, "utf8");
  const moduleVariables = await readFile(scannerModuleVariablesPath, "utf8");

  assert.match(source, /resource "aws_vpc_endpoint" "s3"/);
  assert.match(source, /vpc_endpoint_type\s+=\s+"Gateway"/);
  assert.match(source, /route_table_ids\s+=\s+var\.vpc_endpoint_config\.route_table_ids/);
  assert.match(source, /service_name\s+=\s+"com\.amazonaws\.\$\{var\.region\}\.s3"/);
  assert.match(source, /resource "aws_vpc_endpoint" "sqs"/);
  assert.match(source, /service_name\s+=\s+"com\.amazonaws\.\$\{var\.region\}\.sqs"/);
  assert.match(source, /resource "aws_vpc_endpoint" "logs"/);
  assert.match(source, /service_name\s+=\s+"com\.amazonaws\.\$\{var\.region\}\.logs"/);
  assert.match(source, /var\.vpc_endpoint_config\.enable_logs_endpoint/);
  assert.match(source, /private_dns_enabled\s+=\s+true/);
  assert.match(source, /resource "aws_vpc_endpoint" "lambda"/);
  assert.match(source, /service_name\s+=\s+"com\.amazonaws\.\$\{var\.region\}\.lambda"/);
  assert.match(source, /resource "aws_security_group" "vpc_endpoints"/);
  assert.match(source, /security_groups\s+=\s+\[var\.vpc_endpoint_config\.lambda_security_group_id\]/);
  assert.match(source, /from_port\s+=\s+443/);
  assert.match(source, /to_port\s+=\s+443/);
  assert.match(source, /enable_dns_support/);
  assert.match(source, /enable_dns_hostnames/);
  assert.match(source, /s3:GetObject/);
  assert.match(source, /s3:PutObject/);
  assert.match(source, /AllowRetainedEvidencePrefixListing/);
  assert.match(source, /Action\s+=\s+\["s3:ListBucket"\]/);
  assert.match(source, /"s3:prefix"\s+=\s+\["\$\{local\.artifact_prefix\}\/\*"\]/);
  assert.match(source, /sqs:SendMessage/);
  assert.match(source, /lambda:InvokeFunction/);

  assert.match(root, /vpc_endpoint_config\s+=\s+lookup\(var\.vpc_endpoint_config_by_region/);
  assert.match(variables, /variable "vpc_endpoint_config_by_region"/);
  assert.match(variables, /variable "expected_egress_region_by_region"/);
  assert.match(variables, /"us-west-1"\s+=\s+"California"/);
  assert.match(variables, /route_table_ids\s+=\s+list\(string\)/);
  assert.match(variables, /enable_logs_endpoint\s+=\s+optional\(bool, true\)/);
  assert.match(moduleVariables, /variable "vpc_endpoint_config"/);
  assert.match(moduleVariables, /lambda_security_group_id\s+=\s+string/);
  assert.match(moduleVariables, /enable_logs_endpoint\s+=\s+optional\(bool, true\)/);

  // NAT route removal remains a separately authorized migration action.
  assert.doesNotMatch(source, /resource "aws_route"/);
  assert.doesNotMatch(source, /resource "aws_nat_gateway"/);
  assert.doesNotMatch(source, /resource "aws_eip"/);
});

test("routine scanner deploys promote immutable digests without recreating infrastructure", async () => {
  const source = await readFile("scripts/deploy-fast.ts", "utf8");
  const deployFunction = source.match(/async function deployScanners[\s\S]*?\n}\n\nasync function readScannerWebBotAuthPrivateKey/)?.[0] ?? "";
  const verifyFunction = source.match(/async function verifyScanners[\s\S]*?\n}\n\nasync function ensureWorkflowRun/)?.[0] ?? "";
  assert.match(deployFunction, /imageDetails\[0\]\.imageDigest/);
  assert.match(deployFunction, /await applyScannerRuntimeConfiguration\(\)/);
  assert.match(deployFunction, /"lambda", "update-function-code"/);
  assert.ok(
    deployFunction.indexOf("await applyScannerRuntimeConfiguration()") <
      deployFunction.indexOf('"lambda", "update-function-code"'),
    "scanner runtime configuration must converge before image promotion"
  );
  assert.doesNotMatch(deployFunction, /setup-dev-aws-image\.sh/);
  assert.match(source, /"lambda", "update-function-configuration"/);
  assert.match(source, /"--memory-size", String\(SCANNER_MEMORY_SIZE\)/);
  assert.match(source, /const SCANNER_MEMORY_SIZE = 3008/);
  assert.match(verifyFunction, /imageTag=\$\{expectedSha\}/);
  assert.match(verifyFunction, /endsWith\(`@\$\{expectedDigest\}`\)/);
  assert.match(verifyFunction, /payload\.MemorySize !== SCANNER_MEMORY_SIZE/);
  assert.doesNotMatch(verifyFunction, /endsWith\(`:\$\{expectedSha\}`\)/);
});

test("regional scanner parity follows the bounded Lambda and region-specific proxy contracts", async () => {
  const source = await readFile("scripts/check-regional-scanner-parity.ts", "utf8");
  assert.match(source, /\["timeout", config\.Timeout, 75\]/);
  assert.match(source, /"eu-west-1": "ireland-parity-v1"/);
  assert.match(source, /"eu-central-1": "ireland-parity-v1"/);
  assert.match(source, /"us-west-1": "us-ca-vpc-v1"/);
  assert.match(source, /acl vpcsrc src\\s\+\\S\+/);
});
