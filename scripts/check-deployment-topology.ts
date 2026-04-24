import { ZodError } from "zod";
import { loadDeploymentTopology } from "./deployment-topology";

function main() {
  try {
    const topology = loadDeploymentTopology();
    console.info(`PASS acceptedAwsRuntime: ${topology.acceptedAwsRuntime}`);
    console.info(`PASS preferredWebPlatform: ${topology.preferredWebPlatform}`);
    console.info(`PASS currentLiveWebRuntimeTarget: ${topology.currentLiveWebRuntimeTarget}`);
    console.info(`PASS currentLiveGitRef: ${topology.currentLiveGitRef}`);
    console.info(`PASS primaryHost: ${topology.primaryHost}`);
    if (topology.secondaryHost) {
      console.info(`PASS secondaryHost: ${topology.secondaryHost}`);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      for (const issue of error.issues) {
        const label = issue.path.length > 0 ? issue.path.join(".") : "deployment-topology";
        console.error(`FAIL ${label}: ${issue.message}`);
      }
      process.exit(1);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL deployment-topology: ${message}`);
    process.exit(1);
    return;
  }
}

main();
