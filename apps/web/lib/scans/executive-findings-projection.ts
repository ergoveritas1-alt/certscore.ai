import {
  CERT_SCORE_FINDING_REGISTRY,
  type CertScoreFinding,
  type CertScoreFindingConfidence,
  type CertScoreFindingDirectness,
  type CertScoreFindingEvidenceDetails,
  type CertScoreFindingSection,
  type CertScoreFindingSeverity
} from "./finding-registry";
import { getFindingSurfaceScore, selectTopFindings } from "./rank-findings";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

const SECTION_ORDER: CertScoreFindingSection[] = [
  "Privacy & Tracking",
  "Consent Experience",
  "Cookies & Storage",
  "Vendors & Requests",
  "Fingerprinting",
  "Navigation & Redirects",
  "Runtime & Diagnostics",
  "Financial & Claims"
];

const UNIFIED_FINDING_ID_TO_CERT_FINDING_ID: Record<string, keyof typeof CERT_SCORE_FINDING_REGISTRY> = {
  accept_more_prominent_than_reject: "asymmetric_consent_ui",
  accept_only_banner: "consent_dark_patterns_detected",
  dismiss_without_reject: "consent_dark_patterns_detected",
  earnings_claim_without_adjacent_disclosure: "earnings_claim_without_adjacent_disclosure",
  fingerprinting_observed: "probable_fingerprinting",
  forced_consent_wall: "forced_consent_interaction",
  guaranteed_outcome_claim_detected: "guaranteed_outcome_claim_detected",
  leveraged_or_high_risk_product_promotion: "leveraged_or_high_risk_product_promotion",
  policy_behavior_conflict: "policy_behavior_contradiction_detected",
  policy_clarity_risk: "policy_clarity_risk",
  preconsent_tracking: "pre_consent_tracking_detected",
  pricing_or_fee_transparency_unclear: "pricing_or_fee_transparency_unclear",
  reject_button_missing: "reject_option_missing_or_hidden",
  session_replay_observed: "session_recording_services_detected",
  session_replay_undisclosed: "session_recording_services_detected"
};

const CONTRADICTION_FINDING_IDS = new Set([
  "consent_gated_tracking_claim_conflict",
  "do_not_sell_sharing_disclosure_conflict",
  "functional_misalignment",
  "missing_technical_disclosure",
  "policy_behavior_conflict",
  "privacy_cookie_policy_conflict",
  "privacy_terms_conflict"
]);

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getEntityValues(packet: UnifiedFindingDisplayPacket, pattern: RegExp) {
  return uniqueStrings(
    Object.entries(packet.evidence?.entities ?? {}).flatMap(([key, values]) =>
      pattern.test(key) ? values : []
    )
  );
}

function mapConfidenceBandToExecutiveConfidence(
  band: UnifiedFindingDisplayPacket["confidenceBand"]
): CertScoreFindingConfidence {
  if (band === "high") {
    return "strong";
  }
  if (band === "moderate") {
    return "good";
  }
  return "moderate";
}

function mapVerificationStateToDirectness(
  state: UnifiedFindingDisplayPacket["presentationDecision"]["verificationState"]
): CertScoreFindingDirectness {
  if (state === "verified" || state === "runtime") {
    return "direct";
  }
  if (state === "blocked") {
    return "inferred";
  }
  return "mixed";
}

function mapSeverity(
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
): CertScoreFindingSeverity {
  if (findingId === "pre_consent_tracking_detected" && packet.severity === "high") {
    return "critical";
  }
  if (packet.severity === "high") {
    return "high";
  }
  if (packet.severity === "medium") {
    return "medium";
  }
  return "low";
}

function getMappedFindingId(
  packet: UnifiedFindingDisplayPacket
): keyof typeof CERT_SCORE_FINDING_REGISTRY | null {
  if (packet.unifiedFindingId in CERT_SCORE_FINDING_REGISTRY) {
    return packet.unifiedFindingId as keyof typeof CERT_SCORE_FINDING_REGISTRY;
  }
  if (packet.unifiedFindingId in UNIFIED_FINDING_ID_TO_CERT_FINDING_ID) {
    return UNIFIED_FINDING_ID_TO_CERT_FINDING_ID[packet.unifiedFindingId] ?? null;
  }
  if (packet.details?.family === "contradiction" || CONTRADICTION_FINDING_IDS.has(packet.unifiedFindingId)) {
    return "policy_behavior_contradiction_detected";
  }
  return null;
}

function buildEvidencePreview(packet: UnifiedFindingDisplayPacket, findingId?: keyof typeof CERT_SCORE_FINDING_REGISTRY) {
  const sessionReplayEvidence =
    findingId === "session_recording_services_detected"
      ? buildExecutiveEvidenceDetails(packet, findingId)
      : null;

  return uniqueStrings([
    packet.summary,
    packet.observedValue,
    ...(sessionReplayEvidence?.runtimeVendors ?? []).map((vendor) => `Runtime vendor: ${vendor}`),
    ...(sessionReplayEvidence?.runtimeRequestUrls ?? []).slice(0, 2).map((url) => `Runtime request: ${url}`),
    ...(packet.evidence?.snippets ?? []),
    ...(packet.evidence?.sourceUrls ?? []).slice(0, 2),
    ...packet.sourceRefs.flatMap((sourceRef) => {
      if (sourceRef.kind === "signal") {
        return sourceRef.label ?? null;
      }
      if (sourceRef.kind === "validation") {
        return sourceRef.title ?? sourceRef.ruleKey;
      }
      return sourceRef.title ?? null;
    })
  ]).slice(0, 4);
}

function buildEvidenceRefs(packet: UnifiedFindingDisplayPacket) {
  return uniqueStrings([
    packet.primaryPageUrl,
    packet.referenceUrl,
    packet.sourceUrl,
    ...(packet.evidence?.pageUrls ?? []),
    ...(packet.evidence?.sourceUrls ?? [])
  ]).slice(0, 4);
}

const SESSION_REPLAY_VENDOR_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Microsoft Clarity", pattern: /microsoft\s+clarity|clarity\.ms|\bclarity\b/i },
  { label: "FullStory", pattern: /fullstory|fullstory\.com/i },
  { label: "Hotjar", pattern: /hotjar|hotjar\.com/i },
  { label: "Qualtrics SiteIntercept", pattern: /qualtrics|siteintercept/i },
  { label: "LogRocket", pattern: /logrocket|logrocket\.com/i },
  { label: "Mouseflow", pattern: /mouseflow|mouseflow\.com/i },
  { label: "Smartlook", pattern: /smartlook|smartlook\.com/i },
  { label: "Contentsquare", pattern: /contentsquare|contentsquare\.com/i },
  { label: "Quantum Metric", pattern: /quantum\s+metric|quantummetric\.com/i },
  { label: "Crazy Egg", pattern: /crazy\s*egg|crazyegg\.com/i },
  { label: "Inspectlet", pattern: /inspectlet|inspectlet\.com/i },
  { label: "Lucky Orange", pattern: /lucky\s+orange|luckyorange\.com/i }
];

const SESSION_REPLAY_URL_PATTERN =
  /clarity\.ms|fullstory\.com|hotjar\.com|qualtrics|siteintercept|logrocket\.com|mouseflow\.com|smartlook\.com|contentsquare\.com|quantummetric\.com|crazyegg\.com|inspectlet\.com|luckyorange\.com/i;

function formatVendorList(vendors: string[]) {
  if (vendors.length <= 1) {
    return vendors[0] ?? "";
  }
  if (vendors.length === 2) {
    return `${vendors[0]} and ${vendors[1]}`;
  }
  return `${vendors.slice(0, -1).join(", ")}, and ${vendors[vendors.length - 1]}`;
}

function getSessionReplayVendors(packet: UnifiedFindingDisplayPacket) {
  const entityValues = getEntityValues(packet, /vendor/i);
  const reviewerVisibleText = uniqueStrings([
    packet.observedValue,
    packet.summary,
    ...(packet.evidence?.snippets ?? []),
    ...entityValues
  ]).join(" ");

  return SESSION_REPLAY_VENDOR_PATTERNS.flatMap(({ label, pattern }) =>
    pattern.test(reviewerVisibleText) ? [label] : []
  );
}

function getSessionReplayRequestUrls(packet: UnifiedFindingDisplayPacket) {
  return uniqueStrings(packet.evidence?.sourceUrls ?? []).filter((url) => SESSION_REPLAY_URL_PATTERN.test(url));
}

function buildExecutiveEvidenceDetails(
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
): CertScoreFindingEvidenceDetails | undefined {
  if (findingId !== "session_recording_services_detected") {
    return undefined;
  }

  const runtimeVendors = uniqueStrings([...getEntityValues(packet, /runtime.*vendor|vendor/i), ...getSessionReplayVendors(packet)]);
  const runtimeRequestUrls = getSessionReplayRequestUrls(packet);
  const sourceSignals = uniqueStrings(
    packet.sourceRefs.flatMap((sourceRef) => {
      if (sourceRef.kind !== "signal") {
        return [];
      }
      return sourceRef.label ? `${sourceRef.key}: ${sourceRef.label}` : sourceRef.key;
    })
  );
  const evidenceFlags = uniqueStrings(packet.evidence?.flags ?? []);
  const details: CertScoreFindingEvidenceDetails = {};

  if (runtimeVendors.length > 0) {
    details.runtimeVendors = runtimeVendors;
  }
  if (runtimeRequestUrls.length > 0) {
    details.runtimeRequestUrls = runtimeRequestUrls;
  }
  if (sourceSignals.length > 0) {
    details.sourceSignals = sourceSignals;
  }
  if (evidenceFlags.length > 0) {
    details.evidenceFlags = evidenceFlags;
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

function buildExecutiveShortSummary(
  packet: UnifiedFindingDisplayPacket,
  findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY
) {
  if (findingId === "session_recording_services_detected") {
    const vendors = getSessionReplayVendors(packet);
    if (vendors.length > 0) {
      const vendorList = formatVendorList(vendors);
      return vendors.length === 1
        ? `${vendorList} session recording was observed during runtime collection.`
        : `${vendorList} session recording services were observed during runtime collection.`;
    }

    return "Session recording services were observed during runtime collection.";
  }

  return packet.summary;
}

function buildExecutiveFinding(packet: UnifiedFindingDisplayPacket, findingId: keyof typeof CERT_SCORE_FINDING_REGISTRY) {
  const definition = CERT_SCORE_FINDING_REGISTRY[findingId]!;
  const evidenceDetails = buildExecutiveEvidenceDetails(packet, findingId);
  return {
    id: definition.id,
    label: definition.label,
    section: definition.section,
    defaultSurfacePriority: definition.defaultSurfacePriority,
    whyItMatters: definition.whyItMatters,
    remediation: definition.remediation,
    confidence: mapConfidenceBandToExecutiveConfidence(packet.confidenceBand),
    directVsInferred: mapVerificationStateToDirectness(packet.presentationDecision.verificationState),
    ...(evidenceDetails ? { evidenceDetails } : {}),
    evidencePreview: buildEvidencePreview(packet, findingId),
    evidenceRefs: buildEvidenceRefs(packet),
    severity: mapSeverity(packet, findingId),
    shortSummary: buildExecutiveShortSummary(packet, findingId)
  } satisfies CertScoreFinding;
}

function dedupeExecutiveFindings(findings: CertScoreFinding[]) {
  const byId = new Map<string, CertScoreFinding>();

  for (const finding of findings) {
    const existing = byId.get(finding.id);
    if (!existing || getFindingSurfaceScore(finding) > getFindingSurfaceScore(existing)) {
      byId.set(finding.id, finding);
    }
  }

  return [...byId.values()];
}

function deriveExecutivePosture(findings: CertScoreFinding[]) {
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
    return "Action Needed" as const;
  }
  if (findings.some((finding) => finding.severity === "medium")) {
    return "Watch" as const;
  }
  return "Clear" as const;
}

export type ExecutiveFindingsProjection = {
  surfacedPackets: UnifiedFindingDisplayPacket[];
  findings: CertScoreFinding[];
  groupedFindings: Array<{ section: CertScoreFindingSection; findings: CertScoreFinding[] }>;
  posture: "Clear" | "Watch" | "Action Needed";
  topFindings: CertScoreFinding[];
  trace: {
    packets: Array<{
      executiveFindingId: string | null;
      inExecutiveFindings: boolean;
      inRegulatoryLensInput: boolean;
      inTopFindings: boolean;
      presentationStatus: UnifiedFindingDisplayPacket["presentationDecision"]["status"];
      reportLane: UnifiedFindingDisplayPacket["surfacingDecision"]["reportLane"];
      sourceRefs: UnifiedFindingDisplayPacket["sourceRefs"];
      surfacingDecisionState: UnifiedFindingDisplayPacket["surfacingDecision"]["decisionState"];
      unifiedFindingId: string;
    }>;
    surfacedPacketIds: string[];
    projectedFindingIds: string[];
    unmappedSurfacedPacketIds: string[];
  };
};

export function projectExecutiveFindingsFromUnifiedPackets(
  packets: UnifiedFindingDisplayPacket[]
): ExecutiveFindingsProjection {
  const surfacedPackets = packets.filter((packet) => packet.presentationDecision.status === "surface");
  const mappedPacketRows = surfacedPackets.map((packet) => ({
    packet,
    findingId: getMappedFindingId(packet)
  }));
  const findings = dedupeExecutiveFindings(
    mappedPacketRows.flatMap(({ packet, findingId }) => (findingId ? [buildExecutiveFinding(packet, findingId)] : []))
  );
  const findingIds = new Set(findings.map((finding) => finding.id));
  const groupedFindings = SECTION_ORDER.map((section) => ({
    section,
    findings: findings
      .filter((finding) => finding.section === section)
      .sort((left, right) => getFindingSurfaceScore(right) - getFindingSurfaceScore(left))
  })).filter((group) => group.findings.length > 0);
  const topFindings = selectTopFindings(findings, 5);
  const topFindingIds = new Set(topFindings.map((finding) => finding.id));

  return {
    surfacedPackets,
    findings,
    groupedFindings,
    posture: deriveExecutivePosture(findings),
    topFindings,
    trace: {
      packets: mappedPacketRows.map(({ packet, findingId }) => ({
        executiveFindingId: findingId,
        inExecutiveFindings: findingId ? findingIds.has(findingId) : false,
        inRegulatoryLensInput: findingId ? findingIds.has(findingId) : false,
        inTopFindings: findingId ? topFindingIds.has(findingId) : false,
        presentationStatus: packet.presentationDecision.status,
        reportLane: packet.surfacingDecision.reportLane,
        sourceRefs: packet.sourceRefs,
        surfacingDecisionState: packet.surfacingDecision.decisionState,
        unifiedFindingId: packet.unifiedFindingId
      })),
      surfacedPacketIds: surfacedPackets.map((packet) => packet.unifiedFindingId),
      projectedFindingIds: findings.map((finding) => finding.id),
      unmappedSurfacedPacketIds: mappedPacketRows
        .filter(({ findingId }) => !findingId)
        .map(({ packet }) => packet.unifiedFindingId)
    }
  };
}
