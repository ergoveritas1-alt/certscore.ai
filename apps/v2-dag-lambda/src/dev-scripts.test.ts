import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function readRepoFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("dev image scripts refuse non-us-west-1 AWS regions", async () => {
  const buildScript = await readRepoFile("scripts/local-v2-dag-lambda/build-push-dev-image.sh");
  const setupScript = await readRepoFile("scripts/local-v2-dag-lambda/setup-dev-aws-image.sh");

  assert.match(buildScript, /region="\$\{AWS_REGION:-us-west-1\}"/);
  assert.match(buildScript, /Refusing to build\/push local v2 DAG Lambda image outside us-west-1/);
  assert.match(buildScript, /--provenance=false/);
  assert.match(buildScript, /--sbom=false/);
  assert.match(setupScript, /region="\$\{AWS_REGION:-us-west-1\}"/);
  assert.match(setupScript, /Refusing to create local v2 DAG Lambda resources outside us-west-1/);
});

test("dev image setup uses local names and refuses non-dev resource names", async () => {
  const setupScript = await readRepoFile("scripts/local-v2-dag-lambda/setup-dev-aws-image.sh");

  assert.match(setupScript, /certscore-v2-dag-local/);
  assert.match(setupScript, /Refusing non-dev\/local Lambda function name/);
  assert.match(setupScript, /Refusing non-dev\/local SQS queue name/);
  assert.match(setupScript, /--package-type Image/);
  assert.match(setupScript, /OPENAI_API_KEY/);
  assert.match(setupScript, /file:\/\/\$\{environment_json\}/);
  assert.doesNotMatch(setupScript, /certscore-prod|production/);
});

test("Dockerfile uses Playwright image and the local Lambda runtime bootstrap", async () => {
  const dockerfile = await readRepoFile("apps/v2-dag-lambda/Dockerfile");
  const bootstrap = await readRepoFile("apps/v2-dag-lambda/runtime-bootstrap.mjs");

  assert.match(dockerfile, /mcr\.microsoft\.com\/playwright:v1\.58\.2-noble/);
  assert.match(dockerfile, /runtime-bootstrap\.mjs/);
  assert.match(dockerfile, /PLAYWRIGHT_BROWSERS_PATH=\/ms-playwright/);
  assert.match(dockerfile, /CMD \["src\/handler\.handler"\]/);
  assert.match(bootstrap, /AWS_LAMBDA_RUNTIME_API/);
  assert.match(bootstrap, /runtime\/invocation\/next/);
});

test("handler keeps Lambda outputs artifact-only and non-production", async () => {
  const handlerSource = await readRepoFile("apps/v2-dag-lambda/src/handler.ts");

  assert.match(handlerSource, /artifactOnly: true/);
  assert.match(handlerSource, /productionFindingIntegration: false/);
  assert.doesNotMatch(handlerSource, /insert.*finding|checklistRows|executiveSummary|score:/i);
});
