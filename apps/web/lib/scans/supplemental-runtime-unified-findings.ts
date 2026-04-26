import type { PreviewScanPayload, PreviewSupplementalEvidence } from "@website-signal-risk-scanner/shared";
import {
  classifyRuntimeCookieCategory,
  isFunctionalCookieExcludedFromTrackingEvidence,
  isNonEssentialCookieCategory
} from "./runtime-cookie-evidence";
import {
  buildUnifiedFindingDisplayPackets,
  type UnifiedFindingCandidate,
  type UnifiedFindingDisplayPacket
} from "./unified-findings";

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function getSupplementalEvidence(previewPayload: PreviewScanPayload | null | undefined) {
  return previewPayload?.supplementalEvidence ?? previewPayload?.fallbackEvidence ?? null;
}

function getTrackingCookieNames(evidence: PreviewSupplementalEvidence) {
  return uniqueStrings(evidence.entities?.cookieNames ?? []).filter((name) => {
    if (isFunctionalCookieExcludedFromTrackingEvidence(name)) {
      return false;
    }
    return isNonEssentialCookieCategory(classifyRuntimeCookieCategory(name));
  });
}

function getRuntimeRequestUrls(evidence: PreviewSupplementalEvidence) {
  return uniqueStrings(evidence.entities?.requestUrls ?? []).filter(isHttpUrl);
}

function getRuntimeVendorNames(evidence: PreviewSupplementalEvidence) {
  return uniqueStrings(evidence.entities?.technologyNames ?? []).filter(
    (name) => !/^(onetrust|trustarc|truste|cookiebot|cloudflare)$/i.test(name.trim())
  );
}

export function buildSupplementalRuntimeUnifiedFindingCandidates(
  previewPayload: PreviewScanPayload | null | undefined
): UnifiedFindingCandidate[] {
  const evidence = getSupplementalEvidence(previewPayload);
  if (!evidence) {
    return [];
  }

  const trackingCookieNames = getTrackingCookieNames(evidence);
  const runtimeRequestUrls = getRuntimeRequestUrls(evidence);
  const runtimeVendorNames = getRuntimeVendorNames(evidence);
  if (trackingCookieNames.length === 0 && runtimeRequestUrls.length === 0 && runtimeVendorNames.length === 0) {
    return [];
  }

  const observedParts = [
    runtimeRequestUrls.length > 0
      ? `${runtimeRequestUrls.length} runtime request${runtimeRequestUrls.length === 1 ? "" : "s"}`
      : null,
    trackingCookieNames.length > 0
      ? `${trackingCookieNames.length} tracking cookie${trackingCookieNames.length === 1 ? "" : "s"}`
      : null,
    runtimeVendorNames.length > 0
      ? `${runtimeVendorNames.length} named technolog${runtimeVendorNames.length === 1 ? "y" : "ies"}`
      : null
  ].filter((value): value is string => Boolean(value));

  return [
    {
      description:
        `Supplemental public runtime evidence retained ${observedParts.join(", ")} during the initial page-load path.`,
      evidence: runtimeRequestUrls,
      fallbackEvidence: {
        pageUrl: previewPayload?.normalizedUrl,
        preconsent_cookie_names: trackingCookieNames,
        preconsent_nonessential_cookie_names: trackingCookieNames,
        preconsent_tracker_evidence_urls: runtimeRequestUrls,
        preconsent_tracker_vendors: runtimeVendorNames,
        preconsent_tracking_detected: runtimeRequestUrls.length > 0,
        requestUrls: runtimeRequestUrls,
        runtimeEvidenceUrls: runtimeRequestUrls,
        runtimeVendors: runtimeVendorNames,
        signalKey: "privacy.preconsent_tracking_detected",
        signalValue: true,
        source: evidence.source,
        sourceUrls: runtimeRequestUrls,
        supportingSignals: ["privacy.preconsent_tracking_detected"],
        unifiedFindingId: "preconsent_tracking"
      },
      observedValue: observedParts.join(", "),
      severity: runtimeRequestUrls.length > 0 ? "high" : "medium",
      signalKey: "privacy.preconsent_tracking_detected",
      signalLabel: "Supplemental runtime tracking evidence",
      signalSource: "runtime_artifact_signal",
      sourceType: "signal",
      title: "Supplemental runtime tracking evidence"
    }
  ];
}

export function buildSupplementalRuntimeUnifiedFindingPackets(
  previewPayload: PreviewScanPayload | null | undefined
): UnifiedFindingDisplayPacket[] {
  const candidates = buildSupplementalRuntimeUnifiedFindingCandidates(previewPayload);
  if (candidates.length === 0) {
    return [];
  }

  return buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: candidates,
    validationFindings: [],
    validationFindingLookup: new Map()
  }).filter((packet) => packet.presentationDecision.status !== "suppress");
}
