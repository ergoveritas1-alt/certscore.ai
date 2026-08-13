import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const requiredTrackedFiles = [
  "apps/mcp/Dockerfile",
  "apps/mcp/package.json",
  "apps/mcp/src/env.ts",
  "apps/mcp/src/index.ts",
  "apps/mcp/src/session-store.ts",
  "packages/certscore-mcp-auth/package.json",
  "packages/certscore-mcp-auth/src/index.ts",
  ".github/workflows/mcp-aws-ecs-deploy.yml"
];

const tracked = new Set(execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean));
for (const path of requiredTrackedFiles) {
  assert.equal(existsSync(path), true, `Required MCP source file is missing: ${path}`);
  assert.equal(tracked.has(path), true, `Required MCP source file is not tracked by Git: ${path}`);
}

for (const path of tracked) {
  assert.equal(
    /^(apps\/mcp|packages\/certscore-mcp-auth)\/(dist|node_modules)\//.test(path),
    false,
    `Generated MCP file must not be tracked: ${path}`
  );
}

const dockerfile = readFileSync("apps/mcp/Dockerfile", "utf8");
for (const path of [
  "apps/mcp",
  "packages/certscore-mcp-auth",
  "packages/certscore-mcp",
  "packages/certscore-sdk",
  "packages/shared"
]) {
  assert.match(dockerfile, new RegExp(`COPY ${path.replaceAll("/", "\\/")}`), `MCP Dockerfile must copy ${path}.`);
}

console.log("Tracked MCP source and Docker inputs are reproducible.");
