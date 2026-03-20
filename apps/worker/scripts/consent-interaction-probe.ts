import { randomUUID } from "node:crypto";
import { runConsentInteractionAudit } from "@website-signal-risk-scanner/scan-core";

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
        opt_in_clicks: result.optInClicks,
        opt_out_clicks: result.optOutClicks,
        click_delta: result.consentFrictionDelta,
        auth_wall_detected: result.authWallDetected,
        external_redirect_detected: result.externalRedirectDetected,
        evidence_log: result.evidenceLog,
        baseline: result.baseline,
        postReject: result.postReject,
        postAccept: result.postAccept,
        canonicalRuntimeArtifactPreview: {
          consent_opt_in_clicks: result.optInClicks,
          consent_opt_out_clicks: result.optOutClicks,
          consent_friction_delta: result.consentFrictionDelta,
          consent_redirect_or_auth_required: result.consentRedirectOrAuthRequired,
          consent_opt_in_evidence_log: result.optInEvidenceLog,
          consent_opt_out_evidence_log: result.optOutEvidenceLog
        }
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
