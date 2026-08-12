import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("web deployments use the immutable image SHA for Next.js skew protection", async () => {
  const [nextConfig, dockerfile, workflow] = await Promise.all([
    readFile("apps/web/next.config.mjs", "utf8"),
    readFile("apps/web/Dockerfile", "utf8"),
    readFile(".github/workflows/web-aws-ecs-deploy.yml", "utf8")
  ]);

  assert.match(nextConfig, /deploymentId:\s*process\.env\.BUILD_GIT_SHA\s*\|\|\s*undefined/);
  assert.match(dockerfile, /ARG BUILD_GIT_SHA=""/);
  assert.match(workflow, /--build-arg BUILD_GIT_SHA="\$\{GITHUB_SHA\}"/);
  assert.match(workflow, /docker buildx build \\\n\s+--platform linux\/arm64 \\/);
});

test("production deployment monitoring policy is documented and mechanically bounded", async () => {
  const [agentNotes, runbook, webWorkflow, mcpWorkflow] = await Promise.all([
    readFile("AGENTS.md", "utf8"),
    readFile("docs/aws-ecs-deployment-runbook.md", "utf8"),
    readFile(".github/workflows/web-aws-ecs-deploy.yml", "utf8"),
    readFile(".github/workflows/mcp-aws-ecs-deploy.yml", "utf8")
  ]);

  assert.match(agentNotes, /Before starting or monitoring an AWS ECS production deployment, read and follow/);
  assert.match(agentNotes, /docs\/aws-ecs-deployment-runbook\.md/);
  assert.match(agentNotes, /Cold\s+ARM64 web builds on x64 GitHub-hosted runners may take 45–60 minutes/);
  assert.match(runbook, /Do not manually cancel a web or MCP image build unless all of these are true/);
  assert.match(runbook, /no new underlying build, export, or push output has appeared for at least 15/);
  assert.match(webWorkflow, /deploy-public-web-aws:\n\s+runs-on: ubuntu-latest\n\s+timeout-minutes: 90/);
  assert.match(webWorkflow, /name: Build and push public web image\n\s+timeout-minutes: 60/);
  assert.match(webWorkflow, /Registry build cache found/);
  assert.match(webWorkflow, /Public web ARM64 image build is still active/);
  assert.match(mcpWorkflow, /deploy-mcp-aws:\n\s+runs-on: ubuntu-latest\n\s+timeout-minutes: 75/);
  assert.match(mcpWorkflow, /name: Build and push immutable MCP image\n\s+timeout-minutes: 45/);
  assert.match(mcpWorkflow, /MCP image build is still active/);
});
