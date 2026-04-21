import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const deploymentTopologySchema = z.object({
  currentLiveGitRef: z.string().min(1),
  currentLiveWebRuntimeTarget: z.enum(["amplify", "app-runner", "gcp-vm", "vercel", "unknown"]),
  preferredWebPlatform: z.enum(["amplify", "app-runner"]),
  primaryHost: z.string().url(),
  secondaryHost: z.string().url()
});

test("deployment topology config matches the expected schema", () => {
  const topologyPath = path.join(process.cwd(), "config", "deployment-topology.json");
  const result = deploymentTopologySchema.safeParse(JSON.parse(readFileSync(topologyPath, "utf8")));

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
