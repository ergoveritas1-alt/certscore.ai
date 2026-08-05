import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webTerraformPath = "infra/aws/web-ecs/main.tf";
const validationTerraformPath = "infra/aws/validation/main.tf";
const scannerTerraformPath = "infra/aws/v2-dag-lambda/modules/regional-scanner/main.tf";

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
  assert.match(source, /\.name != "S3_ACCESS_KEY_ID"/);
  assert.match(source, /\.name != "S3_SECRET_ACCESS_KEY"/);

  const terraform = await readFile(validationTerraformPath, "utf8");
  assert.match(terraform, /"logs:FilterLogEvents"/);
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
  assert.match(source, /resource "aws_s3_bucket_versioning" "artifacts"/);
});

test("routine scanner deploys promote immutable digests without recreating infrastructure", async () => {
  const source = await readFile("scripts/deploy-fast.ts", "utf8");
  const deployFunction = source.match(/async function deployScanners[\s\S]*?\n}\n\nasync function verifyScanners/)?.[0] ?? "";
  const verifyFunction = source.match(/async function verifyScanners[\s\S]*?\n}\n\nasync function ensureWorkflowRun/)?.[0] ?? "";
  assert.match(deployFunction, /imageDetails\[0\]\.imageDigest/);
  assert.match(deployFunction, /"lambda", "update-function-code"/);
  assert.doesNotMatch(deployFunction, /setup-dev-aws-image\.sh/);
  assert.match(verifyFunction, /imageTag=\$\{expectedSha\}/);
  assert.match(verifyFunction, /endsWith\(`@\$\{expectedDigest\}`\)/);
  assert.doesNotMatch(verifyFunction, /endsWith\(`:\$\{expectedSha\}`\)/);
});
