import { CHECKLIST_GROUPS, projectReportPriorityFindings, reportPriorityEvidenceRow } from "../../../lib/scans/report-priority-projection";
import { projectCaliforniaChoicePresence, projectCaliforniaPolicyChoiceMethods, projectCaliforniaFrictionlessGpcException, projectCaliforniaOptOutPresence } from "../../../lib/scans/california-choice-presence";
import { retainedConsentVendor } from "../../../lib/scans/retained-consent-vendor";
import { readCaliforniaPrivacyReviewFromConsent } from "@certscore/contracts";
import { projectCmpAudit } from "../../../lib/scans/cmp-audit-projection";
import { readAccessibilityAudit, projectAccessibilityAuditSummary } from "../../../lib/scans/accessibility-audit-evidence";
import { projectScanScoreExplanation } from "../../../lib/api-v2/scan-report-summary";
import { projectReportFormInventory } from "../../../lib/scans/report-form-inventory";
import { projectRetainedActionTimeline } from "../../../lib/scans/action-timeline-projection";
import { readPrivacyAuditEvidence } from "../../../lib/scans/report-review-focus";
import { FORM_DESTINATION_FINDING_ID, formDestinationProjectionSchema } from "@certscore/contracts";
import { cmsSecurityProjectionSchema } from "@certscore/contracts";
import { projectExecutiveRuntimeCards } from "../../../lib/scans/executive-runtime-cards";
import { selectSiteIntegrityFinding, projectStartingPageSiteIntegrityReport } from "../../../lib/scans/site-integrity-report";
import { isAfterActionReportEligible, retainedConsentAssessment } from "../../../lib/scans/after-action-report-eligibility";
import { readChoicePathExecution } from "../../../lib/scans/choice-path-execution";
import { consentControlReportLabels } from "../../../lib/scans/consent-control-report";
import type { ReviewedPolicy } from "../../../lib/scans/full-site-resource-context";
import { projectReportRuntimeInventory } from "../../../lib/scans/report-runtime-inventory";
import { afterClickCoverage } from "../after-action-summary";
import { projectScanReportNoGo } from "../../../lib/scans/scan-report-disposition";
import { siteMetadataProjectionSchema } from "@certscore/contracts";
import { acceptPathIncompleteReason } from "./accept-path-reason";
import type { GdprEprivacyCoverageChecklistItem } from "../../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "../../../lib/scans/gdpr-eprivacy-checklist-rationale";
import { getReportableGdprEprivacyCoverageItems } from "../../../lib/scans/gdpr-eprivacy-reportable-rows";
import { GDPR_TRANSPARENCY_REPORT_ROW_ID_SET } from "../../../lib/scans/gdpr-transparency-report-contract";
import { hydrateChecklistPolicyEvidence } from "../../../lib/scans/checklist-evidence-index";
import type { UnifiedFindingDisplayPacket } from "../../../lib/scans/unified-findings";
import { getHybridRuntimeEvidence } from "../../../lib/scans/hybrid-runtime-evidence";
import { verifiedPolicyDocumentUrls } from "../../../lib/scans/verified-policy-document-urls";
import {
  buildNonEssentialInventoryTallies,
  classifyInventoryEvidence,
  getInventoryObservationNames,
} from "../../../lib/scans/runtime-inventory-projection";
import type { ScanDetailResponse } from "../../../server/scans/get-scan-by-id";
import { deriveCanonicalOverallScoreForReport } from "../../../server/scans/canonical-overall-score";
import { deriveCaliforniaRegulatoryScore } from "../../../lib/scans/california-regulatory-score";
import { getPersistedCanonicalReportProjection } from "../../../server/scans/persisted-canonical-report-projection";
import { getVisualEvidenceArtifacts } from "../../../lib/scans/visual-evidence";
import {
  buildExecutiveRejectPathProjection,
  buildExecutiveTimelineEvents,
} from "../shared-scan-detail-view";
import type {
  ShadowEvidenceRow,
  ShadowEvidenceStatus,
  ShadowFinding,
  ShadowReportData,
  TimelineReportData,
} from "./shadow-report-data";
import { buildAssessmentHighlightsPresentation } from "../../../lib/scans/assessment-highlights";
import { HIDDEN_DETAILED_EVIDENCE_ROW_IDS } from "../../../lib/scans/report-evidence-navigation";
import { buildGpcResponseReportProjection, projectGpcTimeline } from "./gpc-report-projection";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordNumber(source: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = finiteNumber(source?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function recordString(source: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function getPolicySurfaceLinkObserved(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
): boolean {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  const inspection = record(
    runtimeArtifacts?.policySurfaceInspection ?? runtimeArtifacts?.policy_surface_inspection ??
    hybrid?.policySurfaceInspection ?? hybrid?.policy_surface_inspection,
  );
  // Present the persisted canonical inspection outcome; do not infer discovery
  // from an arbitrary URL, page label, or incomplete document.
  return inspection?.outcome === "privacy_policy_observed" &&
    (inspection.privacyPolicyObserved ?? inspection.privacy_policy_observed) === true;
}

export function getPolicySurfaceCoverageStatus(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
): ShadowReportData["policySurfaceCoverage"] {
  const hybrid = getHybridRuntimeEvidence(runtimeArtifacts);
  const inspection = record(
    runtimeArtifacts?.policySurfaceInspection ??
    runtimeArtifacts?.policy_surface_inspection ??
    hybrid?.policySurfaceInspection ??
    hybrid?.policy_surface_inspection,
  );
  if (!inspection) return "unavailable";

  const coverageStatus = recordString(inspection, ["coverageStatus", "coverage_status"]);
  const linkCoverageStatus = recordString(inspection, [
    "linkDiscoveryCoverageStatus",
    "link_discovery_coverage_status",
  ]);
  const retrievalCoverageStatus = recordString(inspection, [
    "documentRetrievalCoverageStatus",
    "document_retrieval_coverage_status",
  ]);
  const outcome = recordString(inspection, ["outcome"]);
  const limitationKeys = inspection.limitationKeys ?? inspection.limitation_keys;

  if (
    coverageStatus === "limited" ||
    linkCoverageStatus === "limited" ||
    retrievalCoverageStatus === "limited" ||
    outcome?.includes("limited") ||
    (Array.isArray(limitationKeys) && limitationKeys.length > 0)
  ) {
    return "limited";
  }
  return coverageStatus === "complete" ? "complete" : "unavailable";
}

export function getConsentControlSummaryLabel(
  controls: ShadowReportData["controls"],
): string {
  const values = Object.values(controls);
  const observed = values.filter((value) => value === "Observed").length;
  return `${observed} of ${values.length} observed`;
}

function formatDuration(milliseconds: number | null | undefined) {
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds)) return "Duration unavailable";
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  return `${Math.round(milliseconds / 100) / 10} sec`;
}

function formatHeaderDuration(milliseconds: number | null | undefined) {
  if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds)) return "Duration unavailable";
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes} min${seconds > 0 ? ` ${seconds} sec` : ""}`
    : `${seconds} sec`;
}

function durationFromTimestamps(scan: ScanDetailResponse["scan"]) {
  const scanOpenedAt = scan.createdAt ?? scan.startedAt;
  if (!scanOpenedAt || !scan.completedAt) return null;

  const startedAtMs = Date.parse(scanOpenedAt);
  const completedAtMs = Date.parse(scan.completedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs) || completedAtMs < startedAtMs) {
    return null;
  }
  return completedAtMs - startedAtMs;
}

function retainedScanDurationMs(scanRecord: ScanDetailResponse) {
  return recordNumber(record(scanRecord.runtimeArtifacts), ["local_v2_dag_scan_core_duration_ms"])
    ?? finiteNumber(scanRecord.scan.durationMs)
    ?? durationFromTimestamps(scanRecord.scan);
}


function formatTimelineTime(milliseconds: number) {
  if (milliseconds <= 0) return "0s";
  return `${Math.round(milliseconds / 10) / 100}s`;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Scan time unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZoneName: "short",
    year: "numeric",
  }).format(parsed);
}

function checklistStatus(item: GdprEprivacyCoverageChecklistItem): ShadowEvidenceStatus {
  if (item.assessmentStatus === "gap_observed" || item.status === "Gap observed") return "Potential gap";
  if (item.assessmentStatus === "review_signal" || item.status === "Review signal") return "Partial concern";
  if (item.status === "Observed") return "Observed";
  if (item.status === "Not observed") return "Not observed";
  if (item.status === "Not confirmed" || item.status === "No match found") return "Not confirmed";
  if (item.status === "Insufficient evidence" || item.status === "Not testable") return "Limited";
  return "Context";
}

function collectKeyedStrings(
  value: unknown,
  keyPattern: RegExp,
  limit: number,
  depth = 0,
  seen = new Set<unknown>(),
): string[] {
  if (depth > 5 || seen.has(value) || value === null || value === undefined) return [];
  if (typeof value !== "object") return [];
  seen.add(value);
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry] as const)
    : Object.entries(value as Record<string, unknown>);
  const matches: string[] = [];
  for (const [key, entry] of entries) {
    if (typeof entry === "string" && entry.trim() && keyPattern.test(key)) {
      matches.push(entry.trim());
    } else if (entry && typeof entry === "object") {
      matches.push(...collectKeyedStrings(entry, keyPattern, limit - matches.length, depth + 1, seen));
    }
    if (matches.length >= limit) break;
  }
  return [...new Set(matches)].slice(0, limit);
}

function policyEvidenceForRow(item: GdprEprivacyCoverageChecklistItem, capturedAt: string) {
  const retained = item.criticalEvidence?.retainedEvidence;
  const urls = collectKeyedStrings(retained, /(?:source|policy|page).*url|url$/i, 4)
    .filter((value) => /^https?:\/\//i.test(value));
  const snippets = collectKeyedStrings(retained, /snippet|excerpt|evidence.*text|matched.*text/i, 5)
    .filter((value) => value.length >= 20);
  if (urls.length === 0 || snippets.length === 0) return undefined;
  const sourceUrl = urls[0];
  if (!sourceUrl) return undefined;
  return {
    capturedAt,
    documentTitle: item.label,
    sourceUrl,
    sections: snippets.map((excerpt, index) => ({
      excerpt,
      heading: index === 0 ? "Matched retained passage" : `Supporting retained passage ${index + 1}`,
    })),
  };
}

function mapChecklistRow(item: GdprEprivacyCoverageChecklistItem, capturedAt: string): ShadowEvidenceRow {
  const { evidenceJson, title } = reportPriorityEvidenceRow(item);
  return {
    canonicalEvidenceJson: JSON.stringify(evidenceJson, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2),
    correctionSteps: [],
    evidenceJson,
    evidenceRefs: item.evidenceRefs,
    id: item.id,
    policyEvidence: policyEvidenceForRow(item, capturedAt),
    status: checklistStatus(item),
    summary: deriveGdprEprivacyCoverageChecklistRowRationale(item),
    title,
  };
}

function mapAcceptContradictionFinding(
  finding: UnifiedFindingDisplayPacket | null,
): ShadowEvidenceRow | null {
  if (!finding) return null;
  const evidenceJson = {
    confidenceBand: finding.confidenceBand,
    evidence: finding.evidence ?? null,
    sourceRefs: finding.sourceRefs,
    unifiedFindingId: finding.unifiedFindingId,
  };
  return {
    canonicalEvidenceJson: JSON.stringify(evidenceJson, null, 2),
    correctionSteps: finding.presentation.suggestedFix
      ? [finding.presentation.suggestedFix]
      : [],
    evidenceJson,
    id: finding.unifiedFindingId,
    status: "Partial concern",
    summary: "The visitor clicked Accept, but the consent record saved afterward still said analytics and advertising were not allowed. The saved record should match the visitor’s choice.",
    title: "Saved consent did not match Accept",
  };
}

function summarizeEvidenceRows(rows: ShadowEvidenceRow[]) {
  const counts = {
    gap_observed: 0,
    neutral_signal: 0,
    positive_signal: 0,
    potential_concern: 0,
    review_signal: 0,
    technical_limitation: 0,
  };
  for (const row of rows) {
    if (row.status === "Potential gap") counts.gap_observed += 1;
    else if (row.status === "Partial concern") counts.review_signal += 1;
    else if (row.status === "Observed") counts.positive_signal += 1;
    else if (row.status === "Limited") counts.technical_limitation += 1;
    else counts.neutral_signal += 1;
  }
  return counts;
}

function scoreLabel(score: number) {
  if (score < 40) return "Review";
  if (score < 70) return "Watch";
  return "Strong";
}


function siteRelationshipLabel(value: "same_site" | "cross_site" | "mixed" | "unknown") {
  if (value === "same_site") return "Same-site";
  if (value === "cross_site") return "Cross-site";
  if (value === "mixed") return "Mixed";
  return "Unknown";
}

function entityRelationshipLabel(value: "same_entity" | "affiliated_entity" | "external_entity" | "mixed" | "unknown") {
  if (value === "same_entity") return "Same entity";
  if (value === "affiliated_entity") return "Affiliated entity";
  if (value === "external_entity") return "External entity";
  if (value === "mixed") return "Mixed";
  return "Unknown";
}

function reportUrl(scanRecord: ScanDetailResponse) {
  const config = record(scanRecord.scan.scanConfigJson);
  const snapshot = record(scanRecord.snapshot);
  return recordString(snapshot, ["final_effective_url", "requested_url", "page_url"])
    ?? recordString(config, ["url", "targetUrl", "target_url", "normalizedUrl", "normalized_url"])
    ?? (scanRecord.scan.domainHostname ? `https://${scanRecord.scan.domainHostname}` : "");
}

function displayLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function surfacedFinding(
  findings: UnifiedFindingDisplayPacket[],
  findingId: string,
) {
  return Array.isArray(findings)
    ? findings.find((finding) =>
        finding.unifiedFindingId === findingId && finding.presentationDecision.status === "surface"
      ) ?? null
    : null;
}

function formatPostAcceptActivity(row: Record<string, unknown>) {
  const activityType = recordString(row, ["activityType"]);
  const vendor = recordString(row, ["vendor"]);
  const hostname = recordString(row, ["hostname"]);
  const storageName = recordString(row, ["storageName"]);
  const atMs = recordNumber(row, ["msAfterAccept"]);
  return {
    atMs,
    detail: [vendor, hostname, storageName]
      .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
      .join(" · ") || null,
    label: activityType === "storage_write" ? "Non-essential storage write" : "Non-essential request",
  };
}

export function buildAcceptPathProjection(
  runtimeArtifacts: Record<string, unknown> | null,
  ownerUnifiedFindings: NonNullable<ReturnType<typeof getPersistedCanonicalReportProjection>>["ownerUnifiedFindings"],
): ShadowReportData["acceptPath"] {
  const projection = record(runtimeArtifacts?.postAcceptEvidenceProjection);
  if (!isAfterActionReportEligible(retainedConsentAssessment(runtimeArtifacts), "accept")) return null;
  // Coverage-only outcomes do not establish that an Accept interaction occurred.
  // Keep them in retained diagnostics, not the After Accept report projection.
  if (!projection) return null;

  const captureCoverage = afterClickCoverage(projection, "accept");
  const execution = readChoicePathExecution(projection, "accept");
  const click = record(record(projection.interactionDiagnostics)?.click);
  if (!captureCoverage && click?.outcome !== "completed" && projection.acceptanceExercised !== true) return null;
  const confirmedEvidenceUsable = projection.registrationStatus === "confirmed" &&
    projection.acceptanceExercised === true &&
    projection.productionProjectable === true;
  const registrationConfirmed = execution?.consentConfirmed ?? confirmedEvidenceUsable;
  const activityRows = Array.isArray(projection.postAcceptActivity)
    ? projection.postAcceptActivity.map(record).filter((row): row is Record<string, unknown> => Boolean(row))
    : [];
  const events = activityRows
    .map(formatPostAcceptActivity)
    .filter((event): event is { atMs: number; detail: string | null; label: string } => event.atMs !== null)
    .sort((left, right) => left.atMs - right.atMs);
  const contradiction = surfacedFinding(ownerUnifiedFindings, "acceptance_signal_contradicts_action");
  const activity = surfacedFinding(ownerUnifiedFindings, "post_accept_consent_dependent_activity");
  const requestCount = activityRows.filter((row) => row.activityType === "network_request").length;
  const storageCount = activityRows.filter((row) => row.activityType === "storage_write").length;
  const countSummary = [
    requestCount > 0 ? `${requestCount} request${requestCount === 1 ? "" : "s"}` : null,
    storageCount > 0 ? `${storageCount} storage write${storageCount === 1 ? "" : "s"}` : null,
  ].filter((value): value is string => Boolean(value)).join(" and ");

  const state = !confirmedEvidenceUsable
    ? "incomplete" as const
    : contradiction
      ? "review_signal" as const
      : activity
        ? "activity_observed" as const
        : "no_activity_observed" as const;
  const label = state === "review_signal"
    ? "Saved consent did not match Accept"
    : state === "activity_observed"
      ? "Consent-dependent activity observed"
      : state === "no_activity_observed"
        ? "No qualifying post-Accept activity observed"
        : captureCoverage ? "After-Accept observation recorded" : "Accept path limited";
  const note = state === "review_signal"
    ? "The visitor clicked Accept, but the consent record saved afterward still said analytics and advertising were not allowed. The saved record should match the visitor’s choice."
    : state === "activity_observed"
      ? `A confirmed Accept was followed by ${countSummary || "qualifying non-essential activity"}, establishing the post-Accept comparison baseline.`
      : state === "no_activity_observed"
        ? "A confirmed Accept and bounded observation window were retained without qualifying post-Accept activity."
        : acceptPathIncompleteReason(projection);

  return {
    evidenceRows: activityRows.map((row) => {
      const formatted = formatPostAcceptActivity(row);
      return { detail: formatted.detail, label: formatted.label };
    }).slice(0, 3),
    label,
    note,
    execution,
    afterClickCoverage: captureCoverage,
    registrationConfirmed,
    observationWindowMs: recordNumber(projection, ["observationWindowMs"]),
    resolverMethod: recordString(projection, ["resolverMethod"]),
    scoreEffect: "none",
    state,
    timelineEvents: events,
  };
}

function buildChoicePathComparison(
  acceptPath: ShadowReportData["acceptPath"],
  rejectPath: ShadowReportData["rejectPath"],
  ownerUnifiedFindings: NonNullable<ReturnType<typeof getPersistedCanonicalReportProjection>>["ownerUnifiedFindings"],
): ShadowReportData["choicePathComparison"] {
  const indistinguishable = surfacedFinding(ownerUnifiedFindings, "accept_reject_outcomes_indistinguishable");
  if (indistinguishable) {
    return {
      label: "Shared observed activity",
      note: "Some retained activity identities appeared after both confirmed choices. This is shared observed activity, not proof that the overall outcomes were identical.",
      state: "indistinguishable",
    };
  }
  if (
    acceptPath?.state === "activity_observed" &&
    rejectPath?.state === "no_issue_observed"
  ) {
    return {
      label: "Different outcomes retained",
      note: "Consent-dependent activity followed Accept, while no qualifying activity followed Reject in the retained windows.",
      state: "different",
    };
  }
  return null;
}

function buildReportIdentity(scanRecord: ScanDetailResponse): ShadowReportData["scan"] {
  const visualArtifacts = getVisualEvidenceArtifacts(scanRecord.runtimeArtifacts);
  const visualEvidence = visualArtifacts
    .find((artifact) => artifact.status === "available" && artifact.key);
  const banner = visualArtifacts.find(artifact => artifact.status === "available" && artifact.key && artifact.bannerCrop);
  const reject = visualArtifacts.find(artifact => artifact.status === "available" && artifact.key && artifact.rejectCrop);
  const prominence = visualArtifacts.find(artifact => artifact.status === "available" && artifact.key && artifact.prominenceCrop);
  return {
    benchmark: scanRecord.domainBenchmark?.industry ?? "Comparable public websites",
    createdAt: formatTimestamp(scanRecord.scan.createdAt),
    createdAtIso: scanRecord.scan.createdAt,
    startedAt: formatTimestamp(scanRecord.scan.startedAt),
    completedAt: formatTimestamp(scanRecord.scan.completedAt),
    duration: formatHeaderDuration(retainedScanDurationMs(scanRecord)),
    host: scanRecord.scan.domainHostname ?? "Public website",
    id: scanRecord.scan.id,
    observedWindow: formatDuration(retainedScanDurationMs(scanRecord) ?? 0),
    origin: scanRecord.scan.scanFromLabel,
    originCode: scanRecord.scan.scanFromValue || scanRecord.scan.scanFromLabel,
    reportUrl: `/scan/${encodeURIComponent(scanRecord.scan.id)}`,
    url: reportUrl(scanRecord),
    visualEvidenceHref: visualEvidence
      ? `/api/scans/${encodeURIComponent(scanRecord.scan.id)}/visual-evidence/${encodeURIComponent(visualEvidence.id)}`
      : null,
    consentBannerPreview: banner?.bannerCrop ? {
      href: `/api/scans/${encodeURIComponent(scanRecord.scan.id)}/visual-evidence/${encodeURIComponent(banner.id)}`,
      crop: banner.bannerCrop,
    } : null,
    consentRejectPreview: reject?.rejectCrop ? {
      href: `/api/scans/${encodeURIComponent(scanRecord.scan.id)}/visual-evidence/${encodeURIComponent(reject.id)}`,
      crop: reject.rejectCrop,
    } : null,
    consentProminencePreview: prominence?.prominenceCrop ? {
      href: `/api/scans/${encodeURIComponent(scanRecord.scan.id)}/visual-evidence/${encodeURIComponent(prominence.id)}`,
      crop: prominence.prominenceCrop,
    } : null,
  };
}

export function buildTimelineReportModel(scanRecord: ScanDetailResponse, reviewedPolicies: ReviewedPolicy[] = []): TimelineReportData {
  const noGo = projectScanReportNoGo(scanRecord);
  if (noGo) {
    return { ...noGo, scan: buildReportIdentity(scanRecord), score: { label: "Not scored" as const, value: null } };
  }
  const canonical = getPersistedCanonicalReportProjection(scanRecord);
  if (!canonical) {
    throw new Error(`Canonical persisted report projection is unavailable for scan ${scanRecord.scan.id}`);
  }
  const checklistRows = hydrateChecklistPolicyEvidence(canonical.checklistRows, canonical.evidenceIndex);
  const reportableChecklistRows = getReportableGdprEprivacyCoverageItems(checklistRows, {
    consentControlAssessment:
      scanRecord.snapshot?.consentControlAssessment ??
      scanRecord.snapshot?.consent_control_assessment ??
      scanRecord.runtimeArtifacts?.consentControlAssessment ??
      scanRecord.runtimeArtifacts?.consent_control_assessment ??
      (scanRecord.runtimeArtifacts?.hybridRuntimeEvidence as Record<string, unknown> | undefined)?.consentControlAssessment ??
      (scanRecord.runtimeArtifacts?.hybrid_runtime_evidence as Record<string, unknown> | undefined)?.consent_control_assessment,
  });
  const capturedAt = formatTimestamp(scanRecord.scan.completedAt ?? scanRecord.scan.createdAt);
  const evidenceRows = reportableChecklistRows.map((item) => mapChecklistRow(item, capturedAt));
  const consentControlSummary = canonical.consentControlSummary ?? null;
  const controls = consentControlReportLabels(consentControlSummary);
  const findings = projectReportPriorityFindings(reportableChecklistRows, canonical.ownerUnifiedFindings);
  const { projection: inventoryProjection, resources: resourceInventory, inventorySummary } = projectReportRuntimeInventory(scanRecord, reviewedPolicies);
  const inventory = inventoryProjection.ungroupedRows.map((row) => ({
    category: row.macroCategory,
    confidence: row.confidence.replace(/_/g, " "),
    controllingEntity: row.canonicalEntity ?? row.vendor,
    domains: row.domains.join(", ") || "Not retained",
    evidence: classifyInventoryEvidence(row),
    evidenceJson: {
      attributionSignatures: row.attributionSignatures,
      storageDetails: row.storageDetails,
      canonicalEntity: row.canonicalEntity,
      cookieDetails: row.cookieDetails,
      embedDetails: row.embedDetails,
      cookieNames: row.cookieNames,
      dataFlows: row.dataFlows,
      domains: row.domains,
      firstSeenMs: row.firstSeenMs,
      observedRecordCount: row.observedRecordCount,
      party: row.party,
      preConsent: row.preConsent,
      purposes: row.purposes,
      regulatoryRelevance: row.regulatoryRelevance,
      requestDetails: row.requestDetails,
      siteRelationship: row.siteRelationship,
      type: row.type,
      vendor: row.vendor,
    },
    entityRelationship: entityRelationshipLabel(row.entityRelationship),
    name: getInventoryObservationNames(row).join(", ") || "Not retained",
    observed: row.firstSeenMs === null ? "Timing unavailable" : formatTimelineTime(row.firstSeenMs),
    priority: row.priority.replace(/_/g, " "),
    purpose: row.purpose,
    relationship: siteRelationshipLabel(row.siteRelationship),
    requestNames: [...row.cookieNames, ...(row.requestDetails ?? []).flatMap((request) => request.path ? [request.path] : [])].slice(0, 8).join(", ") || "Not retained",
    serverLocation: row.dataFlows[0]?.networkDestination.country ?? row.dataFlows[0]?.networkDestination.label ?? "Location not retained",
    transferMechanism: row.dataFlows[0]?.transferMechanism.basis ?? "Unknown",
    type: row.type === "embed" ? "Embed / iframe" : row.type === "storage" ? "Browser storage" : row.type === "cookie" ? "Cookie / storage" : "Tracker / request",
    vendor: row.vendor,
    recordCount: row.observedRecordCount,
    requestCount: row.requestCount,
  }));
  const snapshot = record(scanRecord.snapshot);
  const retainedDurationMs = retainedScanDurationMs(scanRecord);
  const durationMs = retainedDurationMs ?? 0;
  const consentVendor = retainedConsentVendor(scanRecord);
  const runtimeArtifacts = record(scanRecord.runtimeArtifacts);
  const accessibilityAudit = projectAccessibilityAuditSummary(runtimeArtifacts?.accessibilityAudit, scanRecord.scan.id);
  const accessibilityEvidence = readAccessibilityAudit(runtimeArtifacts?.accessibilityAudit, scanRecord.scan.id)?.observation ?? null;
  const policySurfaceCoverage = getPolicySurfaceCoverageStatus(runtimeArtifacts);
  const acceptPath = buildAcceptPathProjection({ ...runtimeArtifacts, consentControlAssessment: retainedConsentAssessment(scanRecord) }, canonical.ownerUnifiedFindings);
  const acceptContradictionRow = mapAcceptContradictionFinding(
    surfacedFinding(canonical.ownerUnifiedFindings, "acceptance_signal_contradicts_action"),
  );
  const rejectPath = buildExecutiveRejectPathProjection(
    reportableChecklistRows.find((item) => item.id === "post_reject_tracking_reduction"),
  );
  const actionTimelines = {
    accept: projectRetainedActionTimeline(runtimeArtifacts?.postAcceptEvidenceProjection, retainedConsentAssessment(scanRecord), "accept"),
    reject: projectRetainedActionTimeline(runtimeArtifacts?.postRefusalEvidenceProjection, retainedConsentAssessment(scanRecord), "reject",
      rejectPath?.state === "issue_observed" || rejectPath?.state === "review_signal" ? "concern" : "neutral"),
  };
  const choicePathComparison = buildChoicePathComparison(
    acceptPath,
    rejectPath,
    canonical.ownerUnifiedFindings,
  );
  const gpcResponse = buildGpcResponseReportProjection(canonical.ownerUnifiedFindings);
  const executionConfig = record(scanRecord.scan.scanConfigJson)?.execution;
  const gpcLambdaConfig = record(record(executionConfig)?.v2DagLambda);
  const gpcObservationEnabled = gpcLambdaConfig?.gpcObservationEnabled === true ||
    gpcLambdaConfig?.gpcObservationRequested === true;
  const gpcLaneStatus = gpcResponse
    ? "completed" as const
    : gpcObservationEnabled
      ? "unavailable" as const
      : "not_requested" as const;
  const timeline: ShadowReportData["timeline"] = [
    { at: "0s", atMs: 0, detail: "Public page observation began", label: "Scan start", tone: "neutral" },
    ...buildExecutiveTimelineEvents(scanRecord.runtimeArtifacts, reportableChecklistRows).map((event) => ({
      at: formatTimelineTime(event.atMs),
      atMs: event.atMs,
      detail: event.label === "Consent banner"
        ? Object.entries(controls).filter(([, state]) => state !== "Unknown").map(([name, state]) => `${name}: ${state}`).join(" · ") || "Consent inspection incomplete"
        : event.detail ?? `${event.label} first observed`,
      label: event.label,
      tone: event.label === "Consent banner" ? "positive" as const : event.tone === "rose" ? "concern" as const : "neutral" as const,
      vendor: event.vendorLabel ?? undefined,
    })),
  ];
  timeline.push({
    at: formatTimelineTime(durationMs),
    atMs: durationMs,
    detail: "Retained scan window closed",
    label: "Observation end",
    tone: "neutral",
  });
  timeline.sort((left, right) => left.atMs - right.atMs);

  // Reconcile presentation counts from the same canonical checklist rows used
  // by this report. This keeps retained reports aligned when the versioned
  // reportable-row policy changes after their persisted presentation summary.
  const summaryCounts = summarizeEvidenceRows(evidenceRows);
  const canonicalScore = deriveCanonicalOverallScoreForReport({ scanRecord: scanRecord,
    checklistRows,
    unifiedFindings: canonical.ownerUnifiedFindings,
  });
  const assessedScore = recordNumber(snapshot, ["certscore_overall"]) ?? canonicalScore;
  const score = Math.max(0, Math.min(100, assessedScore ?? 0));
  const forms = canonical.collectionSurfaceAssessment?.forms ?? [];
  const formInventory = projectReportFormInventory(scanRecord, canonical);
  const privacyRows = evidenceRows.filter((row) => GDPR_TRANSPARENCY_REPORT_ROW_ID_SET.has(row.id) || row.id === "outdated_transfer_framework_reference");
  const scoreExplanation = projectScanScoreExplanation(scanRecord, score);
  const californiaPrivacyReview = readCaliforniaPrivacyReviewFromConsent(retainedConsentAssessment(scanRecord));
  const californiaScore = deriveCaliforniaRegulatoryScore({ assessment: californiaPrivacyReview,
    checklistRows, unifiedFindings: canonical.ownerUnifiedFindings });
  const cmpAudit = projectCmpAudit({ scanId: scanRecord.scan.id, normalizedConcerns: canonical.normalizedConcerns,
    consentControlAssessment: retainedConsentAssessment(scanRecord), checklistRows: reportableChecklistRows,
    unifiedFindings: canonical.ownerUnifiedFindings, scoreExplanation, consentVendor });
  const rejectActivityCaptured = cmpAudit.version === "cmp_audit_report.v3" &&
    cmpAudit.rows.find(row => row.id === "implementation")?.supportingEvidence?.inventory?.choiceActivity?.some(activity => activity.action === "reject");
  const visibleLimitations = evidenceRows.filter(row => row.status === "Limited" && !HIDDEN_DETAILED_EVIDENCE_ROW_IDS.includes(row.id) &&
    !(rejectActivityCaptured && row.id === "post_reject_tracking_reduction"));
  const highlights = buildAssessmentHighlightsPresentation(findings, { kind: "page" }, {
    score: assessedScore,
    coverage: { state: visibleLimitations.length > 0 ? "limited" : evidenceRows.length ? "complete" : "unknown", limitedCount: visibleLimitations.length,
      items: visibleLimitations.map(row => ({ id: row.id, title: row.title })),
    },
  });
  const verdict = highlights.text;
  const nextStep = findings[0]?.correctionSteps[0]
    ?? "Review the retained evidence and address the highest-priority projected finding first.";
  const collectionFields = forms.flatMap((form) => form.fields.map((field) =>
    field.label ?? field.semanticCategory.replace(/_/g, " ")
  ));
  const collectionSurfaces = forms.map((form, index) => ({
    actionHostname: form.actionHostname,
    actionRelationship: displayLabel(form.actionRelationship),
    confidence: `${Math.round(form.confidence * 100)}%`,
    fields: form.fields.map((field) => ({
      confidence: `${Math.round(field.confidence * 100)}%`,
      evidenceRefs: field.evidenceRefs.map((reference) => reference.refId),
      inputType: field.inputType,
      label: field.label ?? displayLabel(field.semanticCategory),
      required: field.required,
      semanticCategory: displayLabel(field.semanticCategory),
      state: field.disabled ? "Disabled" : field.readOnly ? "Read-only" : "Available",
    })),
    fieldsTruncated: form.fieldsTruncated,
    method: form.method.toUpperCase(),
    pageUrl: form.pageUrl,
    title: form.title ?? `${displayLabel(form.surfaceType)} ${index + 1}`,
  }));
  const nonEssentialInventoryTallies = buildNonEssentialInventoryTallies(
    inventoryProjection.ungroupedRows,
  );
  const vendorSurface = inventoryProjection.vendorSurfaceProjection.execSummary;

  const scanConfig = record(scanRecord.scan.scanConfigJson);
  const crawlOptions = record(scanConfig?.crawlOptions);
  const metadata = siteMetadataProjectionSchema.safeParse(record(scanRecord.runtimeArtifacts)?.siteMetadata);
  return {
    assessmentHighlightLinks: highlights.links,
    assessmentHighlightExpansion: highlights.expanded,
    cmpAudit,
    ...(scanConfig?.fullSite === true && crawlOptions ? { fullSite: { maxPages: Number(crawlOptions.maxPages), concurrency: Number(crawlOptions.concurrency), waitSeconds: Number(crawlOptions.waitSeconds) } } : {}),
    siteMetadata: metadata.success ? metadata.data : null,
    accessibilityAudit,
    accessibilityEvidence,
    formDestinations: (() => { const parsed = formDestinationProjectionSchema.safeParse(runtimeArtifacts?.formDestinations); return parsed.success ? parsed.data : null; })(),
    formDestinationWarning: findings.some(finding => finding.id === FORM_DESTINATION_FINDING_ID),
    cmsSecurity: (() => { const cms = cmsSecurityProjectionSchema.safeParse(runtimeArtifacts?.cmsSecurity); return cms.success ? cms.data : null; })(),
    collectionFields,
    runtimeEvidenceGraph: inventoryProjection.runtimeEvidenceGraph,
    collectionLimitations: canonical.collectionSurfaceAssessment?.limitationKeys.map(displayLabel) ?? [],
    collectionCoverage: {
      pagesWithoutInventory: canonical.collectionSurfaceAssessment ? 0 : 1,
      limitedPages: canonical.collectionSurfaceAssessment && (
        canonical.collectionSurfaceAssessment.assessmentStatus === "limited" ||
        canonical.collectionSurfaceAssessment.assessmentStatus === "not_testable" ||
        canonical.collectionSurfaceAssessment.coverage?.status !== "complete"
      ) ? 1 : 0,
    },
    collectionStatus: canonical.collectionSurfaceAssessment?.assessmentStatus
      ? displayLabel(canonical.collectionSurfaceAssessment.assessmentStatus)
      : "Unavailable",
    collectionSurfaces,
    consentVendor,
    policySurfaceCoverage,
    policySurfaceLinkObserved: getPolicySurfaceLinkObserved(runtimeArtifacts),
    verifiedPolicyDocumentUrls: verifiedPolicyDocumentUrls(runtimeArtifacts),
    gpcResponse,
    gpcTimeline: projectGpcTimeline(gpcResponse),
    gpcLaneStatus,
    californiaPrivacyReview,
    californiaFrictionlessGpcException: projectCaliforniaFrictionlessGpcException(canonical.ownerUnifiedFindings, scanRecord.scan.id, californiaPrivacyReview?.documentUrl),
    californiaPolicyChoiceMethods: projectCaliforniaPolicyChoiceMethods(canonical.ownerUnifiedFindings, scanRecord.scan.id, californiaPrivacyReview?.documentUrl),
    californiaOptOutPresence: projectCaliforniaOptOutPresence(canonical.ownerUnifiedFindings, scanRecord.scan.id, californiaPrivacyReview?.documentUrl),
    californiaChoicePresence: projectCaliforniaChoicePresence(canonical.ownerUnifiedFindings, scanRecord.scan.id, californiaPrivacyReview?.documentUrl),
    californiaScore,
    privacyAuditEvidence: readPrivacyAuditEvidence(runtimeArtifacts, scanRecord.scan.id),
    acceptPath,
    actionTimelines,
    choicePathComparison,
    consentRows: [
      ...evidenceRows.filter((row) => CHECKLIST_GROUPS.consent.has(row.id)),
      ...(acceptContradictionRow ? [acceptContradictionRow] : []),
    ],
    controls,
    consentControlBehavior: (() => {
      const behavior = record(reportableChecklistRows.find(row => row.id === "accept_consent_control")?.criticalEvidence.retainedEvidence?.consentControlBehavior);
      return recordString(behavior, ["description"]);
    })(),
    consentControlsAvailable: consentControlSummary !== null,
    coverage: {
      concern: summaryCounts.gap_observed,
      contextual: summaryCounts.neutral_signal,
      limited: summaryCounts.technical_limitation,
      partial: summaryCounts.potential_concern,
      positive: summaryCounts.positive_signal,
      review: summaryCounts.review_signal,
      rows: reportableChecklistRows.length,
      usableEvidence: Math.max(0, reportableChecklistRows.length - summaryCounts.technical_limitation),
    },
    findings,
    siteIntegrity: selectSiteIntegrityFinding(canonical.ownerUnifiedFindings),
    siteIntegritySummary: projectStartingPageSiteIntegrityReport(runtimeArtifacts?.siteIntegrity, canonical.ownerUnifiedFindings),
    executiveHeadline: "Executive overview",
    gdprTransparencyRows: privacyRows,
    inventory,
    inventorySummary,
    resourceInventory,
    afterAcceptFormsLimited: formInventory.afterAcceptLimited,
    collectionTableRows: formInventory.rows,
    metrics: {
      domains: vendorSurface.thirdPartyDomains.length,
      fields: formInventory.rows.reduce((total, row) => total + row.form.fields.length, 0),
      forms: formInventory.rows.length,
      nonEssentialCookiesStorage: nonEssentialInventoryTallies.cookiesStorage,
      nonEssentialRequests: nonEssentialInventoryTallies.requests,
      thirdPartyEmbeds: inventoryProjection.embedRows.filter((row) => row.party === "third_party").length,
      vendors: vendorSurface.resolvedVendorNames.length + vendorSurface.unresolvedVendorHosts.length,
    },
    nextStep,
    executiveRuntimeCards: projectExecutiveRuntimeCards(reportableChecklistRows.map(row => ({ ...row, retainedEvidence: row.criticalEvidence.retainedEvidence }))),
    preConsentRuntimeRows: evidenceRows.filter((row) => CHECKLIST_GROUPS.runtime.has(row.id)),
    rejectPath,
    relatedRows: [],
    scan: buildReportIdentity(scanRecord),
    score: { label: scoreLabel(score), value: score },
    formsSummary: formInventory.summary,
    scoreExplanation,
    timeline,
    trackingExternalRows: evidenceRows.filter((row) => CHECKLIST_GROUPS.tracking.has(row.id)),
    trackerVendors: [...vendorSurface.resolvedVendorNames, ...vendorSurface.unresolvedVendorHosts],
    transportRows: evidenceRows.filter((row) => CHECKLIST_GROUPS.transport.has(row.id)),
    verdict,
  };
}
