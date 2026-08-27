import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import type { GdprEprivacyCoverageChecklistItem } from "../../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyCoverageChecklistRowRationale } from "../../../lib/scans/gdpr-eprivacy-checklist-rationale";
import { getReportableGdprEprivacyCoverageItems } from "../../../lib/scans/gdpr-eprivacy-reportable-rows";
import { GDPR_TRANSPARENCY_REPORT_ROW_ID_SET } from "../../../lib/scans/gdpr-transparency-report-contract";
import { hydrateChecklistPolicyEvidence } from "../../../lib/scans/checklist-evidence-index";
import {
  buildChecklistConcernTopFindings,
  selectCanonicalHighPriorityFindings,
} from "../../../lib/scans/checklist-concern-top-findings";
import type { CertScoreFinding } from "../../../lib/scans/finding-registry";
import { getHybridRuntimeEvidence } from "../../../lib/scans/hybrid-runtime-evidence";
import {
  buildPreConsentStorageAssessment,
  projectPreConsentStorageMetric,
} from "../../../lib/scans/runtime-cookie-evidence";
import {
  buildRuntimeInventoryProjectionFromScan,
  classifyInventoryEvidence,
} from "../../../lib/scans/runtime-inventory-projection";
import type { ScanDetailResponse } from "../../../server/scans/get-scan-by-id";
import { deriveCanonicalOverallScoreForReport } from "../../../server/scans/canonical-overall-score";
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
} from "./shadow-report-data";
import { buildExecutiveOverview } from "./executive-overview-copy";

const CHECKLIST_GROUPS = {
  consent: new Set([
    "consent_surface_observed",
    "cmp_framework_signal_observed",
    "reject_all_path_availability",
    "accept_consent_control",
    "options_settings_preferences_control",
    "cookie_notice_policy_availability",
  ]),
  tracking: new Set([
    "pre_consent_third_party_tracking",
    "third_party_iframe_pre_consent",
    "social_media_embed_pre_consent",
    "embedded_content_pre_consent",
  ]),
  runtime: new Set([
    "pre_consent_cookies_storage",
    "session_replay_fingerprinting_review",
    "device_identification_fingerprinting_signal_observed",
  ]),
  transport: new Set([
    "transport_security_https_delivery",
    "transport_security_tls_certificate",
    "transport_security_http_redirect",
    "transport_security_mixed_content",
    "transport_security_form_transport",
  ]),
} as const;

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

function retainedConsentVendor(scanRecord: ScanDetailResponse) {
  const retainedName = recordString(record(scanRecord.snapshot), ["cmp_vendor_name", "cmpVendorName"])
    ?? recordString(record(scanRecord.runtimeArtifacts), ["cmp_vendor_name", "cmpVendorName"]);
  if (!retainedName) return null;
  const normalized = retainedName.toLowerCase();
  return KNOWN_CMP_REGISTRY.find((entry) =>
    normalized.includes(entry.canonicalName.toLowerCase()) ||
    entry.aliases.some((alias) => normalized.includes(alias.toLowerCase()))
  )?.canonicalName ?? retainedName;
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

function checklistEvidenceJson(item: GdprEprivacyCoverageChecklistItem) {
  return {
    assessmentStatus: item.assessmentStatus,
    checklistItemId: item.id,
    coverageArea: item.label,
    evidenceState: item.evidenceState,
    explanation: item.explanation,
    note: item.note,
    status: item.status,
    subchecks: item.subchecks,
    tone: item.tone,
    ...item.criticalEvidence,
  };
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
  const evidenceJson = checklistEvidenceJson(item);
  return {
    canonicalEvidenceJson: JSON.stringify(evidenceJson, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2),
    correctionSteps: [],
    evidenceJson,
    evidenceRefs: item.evidenceRefs,
    id: item.id,
    policyEvidence: policyEvidenceForRow(item, capturedAt),
    status: checklistStatus(item),
    summary: deriveGdprEprivacyCoverageChecklistRowRationale(item),
    title: item.label,
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

function mapChecklistFinding(
  finding: CertScoreFinding,
  rank: number,
  evidenceRows: ShadowEvidenceRow[],
): ShadowFinding {
  const policyEvidence = finding.evidenceDetails?.policyEvidenceDetails;
  const rowId = typeof policyEvidence?.rowId === "string" ? policyEvidence.rowId : null;
  const row = rowId ? evidenceRows.find((candidate) => candidate.id === rowId) : null;
  const concernKind = typeof policyEvidence?.regulatoryConcernKind === "string"
    ? policyEvidence.regulatoryConcernKind
    : null;
  const category = (() => {
    if (!row) return finding.section;
    if (CHECKLIST_GROUPS.runtime.has(row.id)) return "Pre-consent runtime";
    if (CHECKLIST_GROUPS.tracking.has(row.id)) return "Tracking & external services";
    if (CHECKLIST_GROUPS.consent.has(row.id)) return "Consent surface";
    if (CHECKLIST_GROUPS.transport.has(row.id)) return "Transport security";
    if (/privacy|policy|disclosure|retention|rights|transfer|controller|recipient/i.test(row.id)) return "Policy & transparency";
    return finding.section;
  })();
  const summary = (() => {
    if (row?.id !== "pre_consent_cookies_storage") return finding.shortSummary;
    const retainedEvidence = record(row.evidenceJson.retainedEvidence);
    const evidenceRefs = retainedEvidence?.evidenceRefs;
    const firstRef = Array.isArray(evidenceRefs)
      ? evidenceRefs.find((value): value is string => typeof value === "string" && value.trim().length > 0)
      : null;
    if (!firstRef) return finding.shortSummary;
    return `Cookies or browser storage were retained before consent. First retained item: ${firstRef.replace(/[.\s]+$/, "")}. Essentiality was not confirmed for every item.`;
  })();
  return {
    correctionSteps: row?.correctionSteps.length ? row.correctionSteps : [finding.remediation],
    evidence: finding.evidencePreview,
    evidenceJson: row?.evidenceJson ?? {
      evidenceDetails: finding.evidenceDetails,
      evidenceRefs: finding.evidenceRefs,
      findingId: finding.id,
    },
    focus: category,
    id: finding.id,
    rank,
    status: concernKind === "partial_rating" ? "Partial concern" : "Potential gap",
    summary,
    title: finding.label,
    vendors: [],
  };
}

function scoreLabel(score: number) {
  if (score < 40) return "Review";
  if (score < 70) return "Watch";
  return "Strong";
}

function projectedControlLabel(
  rows: ShadowEvidenceRow[],
  rowId: "accept_consent_control" | "options_settings_preferences_control" | "reject_all_path_availability",
) {
  const status = rows.find((row) => row.id === rowId)?.status;
  if (status === "Observed") return "Observed";
  if (status === "Not observed" || status === "Potential gap") return "Not observed";
  return "Unknown";
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

function countFormFields(forms: Array<{ fields: unknown[] }>) {
  return forms.reduce((total, form) => total + form.fields.length, 0);
}

function displayLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function buildTimelineReportModel(scanRecord: ScanDetailResponse): ShadowReportData {
  const canonical = getPersistedCanonicalReportProjection(scanRecord);
  if (!canonical) {
    throw new Error(`Canonical persisted report projection is unavailable for scan ${scanRecord.scan.id}`);
  }
  const checklistRows = hydrateChecklistPolicyEvidence(canonical.checklistRows, canonical.evidenceIndex);
  const reportableChecklistRows = getReportableGdprEprivacyCoverageItems(checklistRows);
  const capturedAt = formatTimestamp(scanRecord.scan.completedAt ?? scanRecord.scan.createdAt);
  const evidenceRows = reportableChecklistRows.map((item) => mapChecklistRow(item, capturedAt));
  const controls = {
    accept: projectedControlLabel(evidenceRows, "accept_consent_control"),
    options: projectedControlLabel(evidenceRows, "options_settings_preferences_control"),
    reject: projectedControlLabel(evidenceRows, "reject_all_path_availability"),
  };
  const findings = selectCanonicalHighPriorityFindings(
    buildChecklistConcernTopFindings(checklistRows),
  ).map((finding, index) => mapChecklistFinding(finding, index + 1, evidenceRows));
  const inventoryProjection = buildRuntimeInventoryProjectionFromScan(scanRecord);
  const inventory = inventoryProjection.ungroupedRows.map((row) => ({
    category: row.macroCategory,
    confidence: row.confidence.replace(/_/g, " "),
    controllingEntity: row.canonicalEntity ?? row.vendor,
    domains: row.domains.join(", ") || "Not retained",
    evidence: classifyInventoryEvidence(row),
    evidenceJson: {
      attributionSignatures: row.attributionSignatures,
      canonicalEntity: row.canonicalEntity,
      cookieDetails: row.cookieDetails,
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
    observed: row.firstSeenMs === null ? "Timing unavailable" : formatTimelineTime(row.firstSeenMs),
    priority: row.priority.replace(/_/g, " "),
    purpose: row.purpose,
    relationship: siteRelationshipLabel(row.siteRelationship),
    requestNames: [...row.cookieNames, ...(row.requestDetails ?? []).flatMap((request) => request.path ? [request.path] : [])].slice(0, 8).join(", ") || "Not retained",
    serverLocation: row.dataFlows[0]?.networkDestination.country ?? row.dataFlows[0]?.networkDestination.label ?? "Location not retained",
    transferMechanism: row.dataFlows[0]?.transferMechanism.basis ?? "Unknown",
    type: row.type === "cookie" ? "Cookie / storage" : "Tracker / request",
    vendor: row.vendor,
    recordCount: row.observedRecordCount,
    requestCount: row.requestCount,
  }));
  const snapshot = record(scanRecord.snapshot);
  const retainedDurationMs = retainedScanDurationMs(scanRecord);
  const durationMs = retainedDurationMs ?? 0;
  const consentVendor = retainedConsentVendor(scanRecord);
  const rejectPath = buildExecutiveRejectPathProjection(
    checklistRows.find((item) => item.id === "post_reject_tracking_reduction"),
  );
  const timeline: ShadowReportData["timeline"] = [
    { at: "0s", atMs: 0, detail: "Public page observation began", label: "Scan start", tone: "neutral" },
    ...buildExecutiveTimelineEvents(scanRecord.runtimeArtifacts, reportableChecklistRows).map((event) => ({
      at: formatTimelineTime(event.atMs),
      atMs: event.atMs,
      detail: event.label === "Consent banner"
        ? `Accept ${controls.accept.toLowerCase()} · Reject ${controls.reject.toLowerCase()} · Options ${controls.options.toLowerCase()}`
        : `${event.label} first observed`,
      label: event.label,
      tone: event.label === "Consent banner" ? "positive" as const : event.tone === "rose" || event.tone === "amber" ? "concern" as const : "neutral" as const,
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

  const summaryCounts = canonical.checklistPresentation?.summaryCounts ?? summarizeEvidenceRows(evidenceRows);
  const canonicalScore = deriveCanonicalOverallScoreForReport({
    checklistRows,
    unifiedFindings: canonical.ownerUnifiedFindings,
  });
  const score = Math.max(0, Math.min(100, recordNumber(snapshot, ["certscore_overall"]) ?? canonicalScore ?? 0));
  const forms = canonical.collectionSurfaceAssessment?.forms ?? [];
  const privacyRows = evidenceRows.filter((row) => GDPR_TRANSPARENCY_REPORT_ROW_ID_SET.has(row.id));
  const verdict = buildExecutiveOverview({
    controls,
    findings,
    limitedCount: summaryCounts.technical_limitation,
    limitedItems: checklistRows.filter((row) => checklistStatus(row) === "Limited").map((row) => row.label),
    positiveCount: summaryCounts.positive_signal,
    timeline,
    transportPositiveCount: evidenceRows.filter((row) => CHECKLIST_GROUPS.transport.has(row.id) && row.status === "Observed").length,
  });
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
  const visualEvidence = getVisualEvidenceArtifacts(scanRecord.runtimeArtifacts)
    .find((artifact) => artifact.status === "available" && artifact.key);
  const preConsentStorageMetric = projectPreConsentStorageMetric(buildPreConsentStorageAssessment({
    hybridRuntimeEvidence: getHybridRuntimeEvidence(scanRecord.runtimeArtifacts),
    runtimeArtifacts: scanRecord.runtimeArtifacts,
    runtimeCookieRows: inventoryProjection.cookieRows,
  }));
  const vendorSurface = inventoryProjection.vendorSurfaceProjection.execSummary;

  return {
    collectionFields,
    collectionLimitations: canonical.collectionSurfaceAssessment?.limitationKeys.map(displayLabel) ?? [],
    collectionStatus: canonical.collectionSurfaceAssessment?.assessmentStatus
      ? displayLabel(canonical.collectionSurfaceAssessment.assessmentStatus)
      : "Unavailable",
    collectionSurfaces,
    consentVendor,
    consentRows: evidenceRows.filter((row) => CHECKLIST_GROUPS.consent.has(row.id)),
    controls,
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
    executiveHeadline: "Executive overview",
    gdprTransparencyRows: privacyRows,
    inventory,
    metrics: {
      domains: vendorSurface.thirdPartyDomains.length,
      fields: countFormFields(forms),
      forms: forms.length,
      nonEssentialStorage: preConsentStorageMetric.available ? preConsentStorageMetric.value : null,
      thirdPartyRequests: recordNumber(snapshot, ["third_party_request_count", "third_party_requests_count"]) ?? inventoryProjection.trackerRows.reduce((total, row) => total + (row.requestCount ?? 1), 0),
      vendors: vendorSurface.resolvedVendorNames.length + vendorSurface.unresolvedVendorHosts.length,
    },
    nextStep,
    preConsentRuntimeRows: evidenceRows.filter((row) => CHECKLIST_GROUPS.runtime.has(row.id)),
    rejectPath,
    relatedRows: [],
    scan: {
      benchmark: scanRecord.domainBenchmark?.industry ?? "Comparable public websites",
      createdAt: formatTimestamp(scanRecord.scan.createdAt),
      duration: formatHeaderDuration(retainedDurationMs),
      host: scanRecord.scan.domainHostname ?? "Public website",
      id: scanRecord.scan.id,
      observedWindow: formatDuration(durationMs),
      origin: scanRecord.scan.scanFromLabel,
      originCode: scanRecord.scan.scanFromValue || scanRecord.scan.scanFromLabel,
      reportUrl: `/scan/${encodeURIComponent(scanRecord.scan.id)}`,
      url: reportUrl(scanRecord),
      visualEvidenceHref: visualEvidence
        ? `/api/scans/${encodeURIComponent(scanRecord.scan.id)}/visual-evidence/${encodeURIComponent(visualEvidence.id)}`
        : null,
    },
    score: { label: scoreLabel(score), value: score },
    timeline,
    trackingExternalRows: evidenceRows.filter((row) => CHECKLIST_GROUPS.tracking.has(row.id)),
    trackerVendors: [...vendorSurface.resolvedVendorNames, ...vendorSurface.unresolvedVendorHosts],
    transportRows: evidenceRows.filter((row) => CHECKLIST_GROUPS.transport.has(row.id)),
    verdict,
  };
}
