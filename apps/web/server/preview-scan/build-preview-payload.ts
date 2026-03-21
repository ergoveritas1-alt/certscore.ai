import type { PreviewIssueCounts, PreviewSampleFinding, PreviewScanPayload, ScanSnapshot } from "@website-signal-risk-scanner/shared";

type PreviewSnapshotSource = {
  accessibilityScore: ScanSnapshot["accessibilityScore"];
  certscoreOverall: ScanSnapshot["certscoreOverall"];
  contactPagePresent: ScanSnapshot["contactPagePresent"];
  cookieBannerPresent: ScanSnapshot["cookieBannerPresent"];
  granularPreferencesPresent: ScanSnapshot["granularPreferencesPresent"];
  homepageFetchStatus: ScanSnapshot["homepageFetchStatus"] | null;
  pagesScanned: ScanSnapshot["pagesScanned"];
  partialScan: ScanSnapshot["partialScan"];
  privacyPolicyPresent: ScanSnapshot["privacyPolicyPresent"];
  privacyScore: ScanSnapshot["privacyScore"];
  preconsentTrackingDetected: ScanSnapshot["preconsentTrackingDetected"];
  rejectAllPresent: ScanSnapshot["rejectAllPresent"];
  termsOfServicePresent: ScanSnapshot["termsOfServicePresent"];
  thirdPartyCookieSetBeforeConsent: ScanSnapshot["thirdPartyCookieSetBeforeConsent"];
  totalSignals: ScanSnapshot["totalSignals"];
  trackingBeforeConsentDetected: ScanSnapshot["trackingBeforeConsentDetected"];
  wcagFormLabelErrorCount: ScanSnapshot["wcagFormLabelErrorCount"];
  wcagMissingAltCount: ScanSnapshot["wcagMissingAltCount"];
};

function pushFinding(
  findings: PreviewSampleFinding[],
  finding: PreviewSampleFinding | null,
  limit = 4
) {
  if (finding && findings.length < limit) {
    findings.push(finding);
  }
}

function deriveIssueCounts(findings: PreviewSampleFinding[]): PreviewIssueCounts {
  return findings.reduce<PreviewIssueCounts>(
    (counts, finding) => {
      if (finding.severity === "high") {
        counts.high += 1;
      } else if (finding.severity === "medium") {
        counts.medium += 1;
      } else {
        counts.low += 1;
      }

      return counts;
    },
    { high: 0, medium: 0, low: 0 }
  );
}

export function buildPreviewPayloadFromSnapshot(input: {
  hostname: string;
  normalizedUrl: string;
  snapshot: PreviewSnapshotSource;
}): PreviewScanPayload {
  const findings: PreviewSampleFinding[] = [];
  const siteSurfaceUnverified =
    input.snapshot.pagesScanned === 0 ||
    input.snapshot.homepageFetchStatus === "forbidden" ||
    input.snapshot.homepageFetchStatus === "blocked" ||
    input.snapshot.homepageFetchStatus === "timeout";

  pushFinding(
    findings,
    input.snapshot.wcagMissingAltCount > 0
      ? {
          affectedPage: "Homepage",
          category: "accessibility",
          severity: input.snapshot.wcagMissingAltCount >= 3 ? "high" : "medium",
          title: "Missing image alternative text",
          description:
            input.snapshot.wcagMissingAltCount === 1
              ? "Automated checks found at least one image without alternative text."
              : `Automated checks found ${input.snapshot.wcagMissingAltCount} homepage images without alternative text.`
        }
      : null
  );

  pushFinding(
    findings,
    input.snapshot.trackingBeforeConsentDetected ||
      input.snapshot.preconsentTrackingDetected ||
      input.snapshot.thirdPartyCookieSetBeforeConsent
      ? {
          affectedPage: "Homepage",
          category: "privacy",
          severity: "high",
          title: "Tracking activity observed before consent",
          description:
            "The live preview observed tracking signals or third-party cookies before a clear consent interaction point was completed."
        }
      : null
  );

  pushFinding(
    findings,
    !siteSurfaceUnverified && !input.snapshot.privacyPolicyPresent
      ? {
          affectedPage: "Homepage",
          category: "legal",
          severity: "high",
          title: "Privacy policy not detected",
          description: "The live preview did not detect a likely privacy policy page from the scanned site surface."
        }
      : null
  );

  pushFinding(
    findings,
    input.snapshot.cookieBannerPresent && !input.snapshot.rejectAllPresent && !input.snapshot.granularPreferencesPresent
      ? {
          affectedPage: "Cookie banner",
          category: "privacy",
          severity: "medium",
          title: "Cookie preferences control not obvious",
          description:
            "A consent surface was observed, but a clear reject-all or granular preferences path was not detected."
        }
      : null
  );

  pushFinding(
    findings,
    input.snapshot.wcagFormLabelErrorCount > 0
      ? {
          affectedPage: "Homepage",
          category: "accessibility",
          severity: "medium",
          title: "Form labeling issues detected",
          description:
            "Automated accessibility checks found interactive controls that may not expose clear labels."
        }
      : null
  );

  pushFinding(
    findings,
    !siteSurfaceUnverified && !input.snapshot.termsOfServicePresent
      ? {
          affectedPage: "Footer",
          category: "legal",
          severity: "medium",
          title: "Terms or disclosure link not detected",
          description:
            "The preview did not clearly detect a likely terms, conditions, or comparable disclosure page from the scanned site surface."
        }
      : null
  );

  pushFinding(
    findings,
    !siteSurfaceUnverified && !input.snapshot.contactPagePresent
      ? {
          affectedPage: "Footer",
          category: "legal",
          severity: "medium",
          title: "Public contact path not detected",
          description:
            "The preview did not clearly detect a public contact page or contact route from the scanned site surface."
        }
      : null
  );

  const issueCounts = deriveIssueCounts(findings);
  const pagesScannedDescriptor =
    input.snapshot.pagesScanned === 0
      ? "This preview could not verify a usable homepage fetch during the live pass."
      : input.snapshot.pagesScanned === 1
        ? "This preview focused on the homepage."
        : `This preview scanned ${input.snapshot.pagesScanned} pages in a lightweight pass.`;
  const confidenceDescriptor = siteSurfaceUnverified
    ? "Some legal and disclosure checks could not be verified because the scanned site surface was only partially reachable during the live preview."
    : null;

  return {
    version: "preview-v1",
    hostname: input.hostname,
    normalizedUrl: input.normalizedUrl,
    issueCounts,
    scores: {
      overall: input.snapshot.certscoreOverall,
      privacy: input.snapshot.privacyScore,
      accessibility: input.snapshot.accessibilityScore
    },
    summaryBullets: [
      `${input.snapshot.totalSignals} structured signals were observed in this live preview.`,
      `Preview scores: overall ${input.snapshot.certscoreOverall}, privacy ${input.snapshot.privacyScore}, accessibility ${input.snapshot.accessibilityScore}.`,
      pagesScannedDescriptor,
      ...(confidenceDescriptor ? [confidenceDescriptor] : [])
    ],
    sampleFindings: findings,
    disclaimer: "Preview results show publicly observable website signals only."
  };
}
