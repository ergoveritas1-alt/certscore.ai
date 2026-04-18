import type {
  BlockPageClassification,
  BlockVendorGuess,
  PreviewIssueCounts,
  PreviewSampleFinding,
  PreviewScanPayload,
  ScanSnapshot
} from "@website-signal-risk-scanner/shared";
import { deriveScanStopReason } from "../../lib/scans/scan-stop-reason";

type PreviewSnapshotSource = {
  accessibilityScore: ScanSnapshot["accessibilityScore"];
  authWallDetected?: ScanSnapshot["authWallDetected"] | null;
  authWallSuspected?: ScanSnapshot["authWallSuspected"] | null;
  blockPageClassification?: ScanSnapshot["blockPageClassification"] | null;
  blockVendorGuess?: ScanSnapshot["blockVendorGuess"] | null;
  blockedFlag?: ScanSnapshot["blockedFlag"] | null;
  certscoreOverall: ScanSnapshot["certscoreOverall"];
  captchaFlag?: ScanSnapshot["captchaFlag"] | null;
  contactPagePresent: ScanSnapshot["contactPagePresent"];
  coverageLevel?: ScanSnapshot["coverageLevel"] | null;
  cookiePolicyPresent?: ScanSnapshot["cookiePolicyPresent"] | null;
  cookieBannerPresent: ScanSnapshot["cookieBannerPresent"];
  challengeSuspected?: ScanSnapshot["challengeSuspected"] | null;
  cmpVendorName?: ScanSnapshot["cmpVendorName"] | null;
  consentInteractionModel?: ScanSnapshot["consentInteractionModel"] | null;
  finalUrl: ScanSnapshot["finalUrl"];
  fingerprintBlockSuspected?: ScanSnapshot["fingerprintBlockSuspected"] | null;
  geoBlockSuspected?: ScanSnapshot["geoBlockSuspected"] | null;
  granularPreferencesPresent: ScanSnapshot["granularPreferencesPresent"];
  homepageFetchHttpStatus?: ScanSnapshot["homepageFetchHttpStatus"] | null;
  homepageFetchStatus: ScanSnapshot["homepageFetchStatus"] | null;
  passiveVerificationAttemptCount?: ScanSnapshot["passiveVerificationAttemptCount"] | null;
  passiveVerificationAttempted?: ScanSnapshot["passiveVerificationAttempted"] | null;
  pagesScanned: ScanSnapshot["pagesScanned"];
  partialScan: ScanSnapshot["partialScan"];
  privacyPolicyPresent: ScanSnapshot["privacyPolicyPresent"];
  privacyScore: ScanSnapshot["privacyScore"];
  preconsentTrackingDetected: ScanSnapshot["preconsentTrackingDetected"];
  rateLimitSuspected?: ScanSnapshot["rateLimitSuspected"] | null;
  rejectAllPresent: ScanSnapshot["rejectAllPresent"];
  redirectCount: ScanSnapshot["redirectCount"];
  registeredDomain: ScanSnapshot["registeredDomain"];
  robotsAllowed?: ScanSnapshot["robotsAllowed"] | null;
  robotsFetchHttpStatus?: ScanSnapshot["robotsFetchHttpStatus"] | null;
  robotsFetchStatus?: ScanSnapshot["robotsFetchStatus"] | null;
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

function hostnameFromUrl(value: string | null) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function deriveVerifiedPublicSurfaces(snapshot: PreviewSnapshotSource) {
  const surfaces: string[] = [];

  if (snapshot.privacyPolicyPresent) {
    surfaces.push("privacy policy");
  }

  if (snapshot.termsOfServicePresent) {
    surfaces.push("terms of service");
  }

  if (snapshot.cookiePolicyPresent) {
    surfaces.push("cookie policy");
  }

  if (snapshot.contactPagePresent) {
    surfaces.push("contact page");
  }

  return surfaces;
}

function hasObservableConsentSurface(snapshot: PreviewSnapshotSource) {
  return (
    snapshot.cookieBannerPresent === true ||
    Boolean(snapshot.cmpVendorName) ||
    (snapshot.consentInteractionModel != null && snapshot.consentInteractionModel !== "none") ||
    snapshot.rejectAllPresent === true ||
    snapshot.granularPreferencesPresent === true
  );
}

function isEvidenceRichZeroPagePreview(snapshot: PreviewSnapshotSource, verifiedSurfaces: string[]) {
  const homepageFetchStatusOk = snapshot.homepageFetchStatus === "ok";
  const homepageFetchHttpStatusSuccessful =
    snapshot.homepageFetchHttpStatus == null ||
    (snapshot.homepageFetchHttpStatus >= 200 && snapshot.homepageFetchHttpStatus < 400);
  const corroboratedEvidencePresent =
    verifiedSurfaces.length > 0 ||
    snapshot.totalSignals > 0 ||
    snapshot.trackingBeforeConsentDetected === true ||
    snapshot.preconsentTrackingDetected === true ||
    snapshot.thirdPartyCookieSetBeforeConsent === true;

  return (
    snapshot.pagesScanned === 0 &&
    homepageFetchStatusOk &&
    homepageFetchHttpStatusSuccessful &&
    snapshot.blockedFlag !== true &&
    snapshot.captchaFlag !== true &&
    snapshot.authWallDetected !== true &&
    snapshot.authWallSuspected !== true &&
    snapshot.challengeSuspected !== true &&
    corroboratedEvidencePresent
  );
}

export function buildPreviewPayloadFromSnapshot(input: {
  hostname: string;
  normalizedUrl: string;
  snapshot: PreviewSnapshotSource;
}): PreviewScanPayload {
  const findings: PreviewSampleFinding[] = [];
  const verifiedSurfaces = deriveVerifiedPublicSurfaces(input.snapshot);
  const evidenceRichZeroPagePreview = isEvidenceRichZeroPagePreview(input.snapshot, verifiedSurfaces);
  const observableConsentSurface = hasObservableConsentSurface(input.snapshot);
  const scanStopReason = deriveScanStopReason({
    authWallDetected: input.snapshot.authWallDetected,
    authWallSuspected: input.snapshot.authWallSuspected,
    blockPageClassification: input.snapshot.blockPageClassification as BlockPageClassification | null | undefined,
    blockVendorGuess: input.snapshot.blockVendorGuess as BlockVendorGuess | null | undefined,
    blockedFlag: input.snapshot.blockedFlag,
    captchaFlag: input.snapshot.captchaFlag,
    challengeSuspected: input.snapshot.challengeSuspected,
    fingerprintBlockSuspected: input.snapshot.fingerprintBlockSuspected,
    geoBlockSuspected: input.snapshot.geoBlockSuspected,
    homepageFetchHttpStatus: input.snapshot.homepageFetchHttpStatus,
    homepageFetchStatus: input.snapshot.homepageFetchStatus,
    pagesScanned: input.snapshot.pagesScanned,
    rateLimitSuspected: input.snapshot.rateLimitSuspected,
    robotsAllowed: input.snapshot.robotsAllowed,
    robotsFetchHttpStatus: input.snapshot.robotsFetchHttpStatus,
    robotsFetchStatus: input.snapshot.robotsFetchStatus
  });
  const siteSurfaceUnverified = scanStopReason !== null && !evidenceRichZeroPagePreview;
  const secondarySurfaceCoverageLimited = input.snapshot.partialScan || input.snapshot.pagesScanned < 3;
  const requestedHostname = input.hostname.toLowerCase().replace(/^www\./, "");
  const finalHostname = hostnameFromUrl(input.snapshot.finalUrl);
  const registeredDomain = input.snapshot.registeredDomain?.toLowerCase().replace(/^www\./, "") ?? null;
  const offDomainRedirect =
    Boolean(finalHostname) && finalHostname !== requestedHostname && (!registeredDomain || finalHostname !== registeredDomain);

  const snapshotScoresLookUnreliable =
    evidenceRichZeroPagePreview &&
    input.snapshot.certscoreOverall === 0 &&
    input.snapshot.privacyScore === 0 &&
    input.snapshot.accessibilityScore === 0;

  pushFinding(
    findings,
    scanStopReason &&
      [
        "reachability_blocked_homepage_403",
        "reachability_blocked_homepage_401",
        "reachability_blocked_challenge_suspected",
        "reachability_blocked_captcha",
        "reachability_blocked_auth_wall",
        "reachability_blocked_geo_or_reputation",
        "robots_restricted",
        "homepage_rate_limited_429",
        "unknown_access_limitation"
      ].includes(scanStopReason.kind)
      ? {
          affectedPage: "Homepage",
          category: "legal",
          severity: "medium",
          title: scanStopReason.previewFindingTitle,
          description: scanStopReason.reason.replace(/^Reason:\s*/i, "")
        }
      : null
  );

  pushFinding(
    findings,
    scanStopReason && ["timeout_navigation", "transport_failure"].includes(scanStopReason.kind)
      ? {
          affectedPage: "Homepage",
          category: "legal",
          severity: "high",
          title: scanStopReason.previewFindingTitle,
          description: scanStopReason.reason.replace(/^Reason:\s*/i, "")
        }
      : null
  );

  pushFinding(
    findings,
    scanStopReason?.kind === "inactive_or_unstable"
      ? {
          affectedPage: "Homepage",
          category: "legal",
          severity: "high",
          title: scanStopReason.previewFindingTitle,
          description: scanStopReason.reason.replace(/^Reason:\s*/i, "")
        }
      : null
  );

  pushFinding(
    findings,
    siteSurfaceUnverified && verifiedSurfaces.length > 0
      ? {
          affectedPage: "Public disclosures",
          category: "legal",
          severity: "low",
          title: "Verified public disclosure surfaces detected",
          description: `Despite the blocked primary scan path, the preview still verified: ${verifiedSurfaces.join(", ")}.`
        }
      : null,
    5
  );

  pushFinding(
    findings,
    offDomainRedirect
      ? {
          affectedPage: "Homepage",
          category: "legal",
          severity: "high",
          title: "Domain redirected to a different site",
          description: `The requested domain resolved to ${finalHostname}, which suggests the site may now redirect to a different operator or destination.`
        }
      : null
  );

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
    !siteSurfaceUnverified &&
    observableConsentSurface &&
    (input.snapshot.trackingBeforeConsentDetected ||
      input.snapshot.preconsentTrackingDetected ||
      input.snapshot.thirdPartyCookieSetBeforeConsent)
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
    observableConsentSurface && !input.snapshot.rejectAllPresent && !input.snapshot.granularPreferencesPresent
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
    !siteSurfaceUnverified && !secondarySurfaceCoverageLimited && !input.snapshot.termsOfServicePresent
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
    !siteSurfaceUnverified && !secondarySurfaceCoverageLimited && !input.snapshot.contactPagePresent
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
    siteSurfaceUnverified
      ? scanStopReason?.reason.replace(/^Reason:\s*/i, "") ?? "This preview could not verify a usable homepage fetch during the live pass."
      : input.snapshot.pagesScanned === 1
        ? "This preview focused on the homepage."
        : `This preview scanned ${input.snapshot.pagesScanned} pages in a lightweight pass.`;
  const confidenceDescriptor = siteSurfaceUnverified
    ? "Some legal and disclosure checks could not be verified because the scanned site surface was only partially reachable during the live preview."
    : secondarySurfaceCoverageLimited
      ? "This lightweight preview may not verify every secondary legal or contact route unless those pages are directly fetched during the live pass."
      : null;
  const verifiedSurfaceDescriptor =
    siteSurfaceUnverified && verifiedSurfaces.length > 0
      ? `Verified public surfaces detected: ${verifiedSurfaces.join(", ")}.`
      : null;
  const redirectDescriptor =
    offDomainRedirect && finalHostname
      ? `The requested domain redirected to ${finalHostname} during the live pass, so observed content may belong to a different destination site.`
      : null;
  const coverageLevel =
    input.snapshot.coverageLevel ??
    (siteSurfaceUnverified
      ? (verifiedSurfaces.length > 0 ? "limited_partial" : "limited_none")
      : secondarySurfaceCoverageLimited
        ? "lightweight_partial"
        : "broad");
  const passiveVerificationAttempted =
    input.snapshot.passiveVerificationAttempted === true || (input.snapshot.passiveVerificationAttemptCount ?? 0) > 0;
  const homepageStatusEvidence = input.snapshot.homepageFetchHttpStatus ?? input.snapshot.homepageFetchStatus ?? null;
  const robotsStatusEvidence = input.snapshot.robotsFetchHttpStatus ?? input.snapshot.robotsFetchStatus ?? null;
  const protectionVendor =
    scanStopReason?.outcomeTitle === "Access limited by site protections" &&
    typeof input.snapshot.blockVendorGuess === "string" &&
    input.snapshot.blockVendorGuess !== "unknown"
      ? input.snapshot.blockVendorGuess
      : null;

  return {
    version: "preview-v1",
    hostname: input.hostname,
    normalizedUrl: input.normalizedUrl,
    issueCounts,
    resultState: siteSurfaceUnverified
      ? {
          code: scanStopReason?.outcome ?? "unknown_access_limitation",
          coverageLevel,
          title: scanStopReason?.outcomeTitle ?? "Access limited by site protections",
          message:
            scanStopReason?.outcomeTitle === "Access limited by site protections"
              ? "This run could not fully verify public pages because the site limited automated access from the scan environment. This does not by itself mean expected disclosures are absent."
              : scanStopReason?.reviewMessage ?? "This run could not fully verify public pages."
        }
      : undefined,
    evidence: siteSurfaceUnverified
      ? {
          coverageLevel,
          homepageStatus: homepageStatusEvidence,
          passiveVerificationAttempted,
          robotsStatus: robotsStatusEvidence,
          verifiedPublicSurfacesCount: verifiedSurfaces.length,
          protectionVendor
        }
      : undefined,
    scores: siteSurfaceUnverified || snapshotScoresLookUnreliable
      ? undefined
      : {
          overall: input.snapshot.certscoreOverall,
          privacy: input.snapshot.privacyScore,
          accessibility: input.snapshot.accessibilityScore
        },
    summaryBullets: [
      `${input.snapshot.totalSignals} structured signals were observed in this live preview.`,
      ...(siteSurfaceUnverified
        ? [
            "Access limited by site protections.",
            "Preview scores are withheld because the live pass stopped before it verified a trustworthy public site surface.",
            scanStopReason?.reason ?? "Reason: the scanner could not verify a usable homepage surface."
          ]
        : snapshotScoresLookUnreliable
          ? [
              "Preview scores are temporarily withheld because structured evidence was retained but the saved score fields were incomplete for this run."
            ]
          : [`Preview scores: overall ${input.snapshot.certscoreOverall}, privacy ${input.snapshot.privacyScore}, accessibility ${input.snapshot.accessibilityScore}.`]),
      pagesScannedDescriptor,
      ...(redirectDescriptor ? [redirectDescriptor] : []),
      ...(verifiedSurfaceDescriptor ? [verifiedSurfaceDescriptor] : []),
      ...(confidenceDescriptor ? [confidenceDescriptor] : [])
    ],
    sampleFindings: findings,
    disclaimer: "Preview results show publicly observable website signals only."
  };
}
