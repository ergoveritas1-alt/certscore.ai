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
