import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const deploymentTopologySchema = z.object({
  currentLiveGitRef: z.string().min(1),
  currentLiveWebRuntimeTarget: z.enum(["amplify", "app-runner", "gcp-vm", "vercel", "unknown"]),
  preferredWebPlatform: z.enum(["amplify", "app-runner"]),
  primaryHost: z.string().url(),
  secondaryHost: z.string().url()
});

export type DeploymentTopology = z.infer<typeof deploymentTopologySchema>;

export function getDeploymentTopologyPath(cwd = process.cwd()) {
  return path.join(cwd, "config", "deployment-topology.json");
}

export function loadDeploymentTopology(cwd = process.cwd()): DeploymentTopology {
  return deploymentTopologySchema.parse(JSON.parse(readFileSync(getDeploymentTopologyPath(cwd), "utf8")));
}
