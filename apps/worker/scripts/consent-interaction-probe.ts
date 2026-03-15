import { randomUUID } from "node:crypto";
import { runConsentInteractionAudit } from "../src/scan/snapshot/consent-interaction";

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const disableSweep = args.includes("--single-profile");
  const domain = args.find((arg) => !arg.startsWith("--"))?.trim();

  if (!domain) {
    throw new Error("Usage: consent-interaction-probe.ts [--single-profile] <domain>");
  }

  const result = await runConsentInteractionAudit(domain, {
    profileSweep: !disableSweep
  });
  const domainHost = new URL(result.finalUrl).hostname;

  console.log(
    JSON.stringify(
      {
        scanId: randomUUID(),
        domain: domainHost,
        finalUrl: result.finalUrl,
        attemptedProbeProfiles: result.attemptedProbeProfiles,
        winningProbeProfile: result.winningProbeProfile,
        baseline: result.baseline,
        postReject: result.postReject,
        postAccept: result.postAccept
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
