import assert from "node:assert/strict";
import test from "node:test";
import { deploymentTopologySchema, loadDeploymentTopology } from "./deployment-topology";

test("deployment topology config matches the expected schema", () => {
  const result = deploymentTopologySchema.safeParse(loadDeploymentTopology());
  assert.equal(result.success, true);
});

test("deployment topology schema accepts both supported preferred web platforms", () => {
  const base = {
    currentLiveGitRef: "main",
    currentLiveWebRuntimeTarget: "gcp-vm",
    primaryHost: "https://certscore.ai",
    secondaryHost: "https://consentcheck.site"
  };

  assert.equal(deploymentTopologySchema.safeParse({ ...base, preferredWebPlatform: "amplify" }).success, true);
  assert.equal(deploymentTopologySchema.safeParse({ ...base, preferredWebPlatform: "app-runner" }).success, true);
});
