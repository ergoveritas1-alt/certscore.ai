import assert from "node:assert/strict";
import test from "node:test";
import { deploymentTopologySchema, loadDeploymentTopology } from "./deployment-topology";

test("deployment topology config matches the expected schema", () => {
  const result = deploymentTopologySchema.safeParse(loadDeploymentTopology());
  assert.equal(result.success, true);
});

test("deployment topology schema accepts supported preferred web platforms", () => {
  const base = {
    acceptedAwsRuntime: "app-runner",
    currentLiveGitRef: "main",
    currentLiveWebRuntimeTarget: "ecs-fargate",
    primaryHost: "https://certscore.ai",
    secondaryHost: "https://example.com"
  };

  assert.equal(deploymentTopologySchema.safeParse({ ...base, preferredWebPlatform: "amplify" }).success, true);
  assert.equal(deploymentTopologySchema.safeParse({ ...base, preferredWebPlatform: "app-runner" }).success, true);
  assert.equal(deploymentTopologySchema.safeParse({ ...base, preferredWebPlatform: "ecs-fargate" }).success, true);
});

test("deployment topology schema accepts both supported accepted AWS runtimes", () => {
  const base = {
    currentLiveGitRef: "main",
    currentLiveWebRuntimeTarget: "ecs-fargate",
    preferredWebPlatform: "ecs-fargate",
    primaryHost: "https://certscore.ai",
    secondaryHost: "https://example.com"
  };

  assert.equal(deploymentTopologySchema.safeParse({ ...base, acceptedAwsRuntime: "amplify" }).success, true);
  assert.equal(deploymentTopologySchema.safeParse({ ...base, acceptedAwsRuntime: "app-runner" }).success, true);
  assert.equal(deploymentTopologySchema.safeParse({ ...base, acceptedAwsRuntime: "ecs-fargate" }).success, true);
});

test("deployment topology schema does not require a secondary host", () => {
  const result = deploymentTopologySchema.safeParse({
    acceptedAwsRuntime: "ecs-fargate",
    currentLiveGitRef: "main",
    currentLiveWebRuntimeTarget: "ecs-fargate",
    preferredWebPlatform: "amplify",
    primaryHost: "https://certscore.ai"
  });

  assert.equal(result.success, true);
});
