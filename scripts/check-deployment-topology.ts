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

function main() {
  const topologyPath = path.join(process.cwd(), "config", "deployment-topology.json");
  const parsed = deploymentTopologySchema.safeParse(JSON.parse(readFileSync(topologyPath, "utf8")));

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const label = issue.path.length > 0 ? issue.path.join(".") : "deployment-topology";
      console.error(`FAIL ${label}: ${issue.message}`);
    }
    process.exit(1);
  }

  const topology = parsed.data;
  console.info(`PASS preferredWebPlatform: ${topology.preferredWebPlatform}`);
  console.info(`PASS currentLiveWebRuntimeTarget: ${topology.currentLiveWebRuntimeTarget}`);
  console.info(`PASS currentLiveGitRef: ${topology.currentLiveGitRef}`);
  console.info(`PASS primaryHost: ${topology.primaryHost}`);
  console.info(`PASS secondaryHost: ${topology.secondaryHost}`);
}

main();
