import { query, queryOne } from "@website-signal-risk-scanner/db";
import {
  CANONICAL_VENDOR_RESOLVER_VERSION,
  resolveVendorObservations,
} from "@certscore/vendor-resolver";
import {
  deriveSignalEnrichmentWorkflowState,
  getPrimaryCategoryDescription,
  getPrimaryCategoryLabel,
  mapSignalKeyToTaxonomy
} from "@website-signal-risk-scanner/shared";
import { buildNanoPolicyInputsFromDocumentSources, shouldPreferNanoDocumentSources } from "../../web/lib/scans/nano-document-sources";
import { buildScanReportUnifiedFindingsForScan } from "../../web/lib/scans/scan-report-unified-findings";
import { buildPreconsentEvidenceQualityFallback } from "../../web/lib/scans/hybrid-runtime-evidence";
import {
  diagnosePreConsentCookieEvidence,
  hasConcretePreconsentArtifact,
  hasPreconsentSequenceEvidence
} from "../../web/lib/scans/promotion-evidence-contracts";
import type { UnifiedFindingDisplayPacket } from "../../web/lib/scans/unified-findings";
import type { ScanValidationFinding } from "../../web/lib/scans/validation-review-linking";
import { repairFindingFamilyPacketEvents } from "../../web/server/scans/family-packet-event-repair";

type AuditInput = {
  candidateLimit?: number;
  sinceDays?: number;
  scanLimit?: number;
  notes?: string;
  scans?: AuditScanInput[];
};

type AuditScanInput = {
  batch?: string;
  domain?: string;
  endpointFindingCounts?: Record<string, number>;
  endpointTopFindingIds?: string[];
  manifestRow?: number | string;
  scanId: string;
  trancoRank?: number | string;
};

type RuntimeArtifactRow = {
  created_at: string | null;
  hybrid_runtime_evidence: unknown;
  scan_id: string;
  third_party_request_count: number | null;
  third_party_request_domains: string[] | null;
};

type SnapshotRow = {
  access_posture_class: string | null;
  cookie_count_total: number | null;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status: string | null;
  preconsent_tracking_detected: boolean | null;
  report_finding_count: number | null;
  scan_id: string;
  scan_outcome: string | null;
  third_party_cookie_count: number | null;
  total_signals: number | null;
  tracker_count_total: number | null;
  tracker_vendor_count: number | null;
};

type ValidationFindingRow = {
  evidence_json: unknown;
  finding_source: string | null;
  rule_key: string;
  scan_id: string;
  severity: string | null;
};

type EventCountRow = {
  count: number;
  event_type: string;
  scan_id: string;
};

type TimingScanRow = {
  completed_at: string | null;
  created_at: string;
  id: string;
  scan_config_json?: unknown;
  started_at?: string | null;
  status: string;
};

type TimingEventRow = {
  created_at: string;
  event_type: string;
  metadata_json: unknown;
  scan_id: string;
};

type TimingSignalCountRow = {
  nano_signal_count: number;
  scan_id: string;
  scanner_signal_count: number;
};

type TimingDocumentCountRow = {
  document_source_count: number;
  policy_document_count: number;
  scan_id: string;
};

type TimingFindingCountRow = {
  finding_count: number;
  scan_id: string;
};

type PriorScanAccelerationScanRow = {
  completed_at: string | null;
  id: string;
  pages_scanned: number | null;
  scan_config_json: unknown;
  started_at: string | null;
  status: string;
};

type PriorScanAccelerationDocumentRow = {
  document_type: string | null;
  extraction_status: string | null;
  scan_id: string;
  source_status: string | null;
};

type PriorScanCandidateRow = {
  completed_at: string;
  domain_id: string | null;
  hostname: string | null;
  normalized_url: string | null;
  ready_document_count: number;
  ready_document_types: string[];
  scan_id: string;
};

type SignalContinuityRow = {
  category: string | null;
  population_source: string | null;
  population_status: string | null;
  scan_id: string;
  signal_count: number;
};

type ValidationRuleContinuityRow = {
  finding_source: string | null;
  rule_count: number;
  rule_key: string;
  scan_id: string;
  severity: string | null;
};

type ValidationFindingWithVerdictRow = {
  category: string | null;
  description: string | null;
  evidence_json: Record<string, unknown> | null;
  finding_family: string | null;
  finding_scope: string | null;
  finding_source: string | null;
  finding_subject: string | null;
  id: string;
  page_url: string | null;
  rule_key: string;
  severity: string | null;
  subtype: string | null;
  title: string;
};

type ValidationVerdictRow = {
  agreement_score: number | null;
  confidence: number | null;
  model: string | null;
  prompt_version: string | null;
  rationale: string | null;
  system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
  system_confidence_explanation: string | null;
  system_confidence_score: number | null;
  validation_run_finding_id: string;
  verdict: "supported" | "inconclusive" | "not_supported" | null;
};

type VendorRegistryAuditRow = {
  aliases: string[];
  canonical_name: string;
  confidence: number;
  cookie_names: string[];
  source: string;
  vendor_category: string;
};

type VendorDomainPatternAuditRow = {
  confidence: number;
  domain: string;
  match_type: string;
  source: string;
  vendor_registry_id: string;
};

type ObservedVendorAuditRow = {
  category_count: number;
  categories: string[];
  detection_sources: string[];
  first_seen: string | null;
  last_seen: string | null;
  observed_count: number;
  scan_count: number;
  script_hosts: string[];
  vendor_name: string;
};

type UnknownVendorRuntimeAuditRow = {
  completed_at: string;
  domain_id: string | null;
  hybrid_runtime_evidence: unknown;
  scan_id: string;
  third_party_request_domains: string[] | null;
};

function decodeInput(): AuditInput {
  const encoded = process.env.OPS_PROD_DB_AUDIT_INPUT_BASE64?.trim();
  const inline = process.env.OPS_PROD_DB_AUDIT_INPUT_JSON?.trim();
  const raw = encoded ? Buffer.from(encoded, "base64").toString("utf8") : inline;
  if (!raw) {
    throw new Error("OPS_PROD_DB_AUDIT_INPUT_BASE64 or OPS_PROD_DB_AUDIT_INPUT_JSON is required.");
  }
  const parsed = JSON.parse(raw) as AuditInput;
  const scans = Array.isArray(parsed.scans) ? parsed.scans : [];
  if (scans.length > 250) {
    throw new Error("Audit input is limited to 250 scans per task.");
  }
  for (const scan of scans) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scan.scanId)) {
      throw new Error(`Invalid scanId in audit input: ${scan.scanId}`);
    }
  }
  if (parsed.scanLimit !== undefined && (!Number.isInteger(parsed.scanLimit) || parsed.scanLimit < 1 || parsed.scanLimit > 2000)) {
    throw new Error("scanLimit must be an integer from 1 to 2000.");
  }
  if (parsed.candidateLimit !== undefined && (!Number.isInteger(parsed.candidateLimit) || parsed.candidateLimit < 1 || parsed.candidateLimit > 500)) {
    throw new Error("candidateLimit must be an integer from 1 to 500.");
  }
  return parsed;
}

function requireAuditScans(input: AuditInput) {
  if (!Array.isArray(input.scans) || input.scans.length === 0) {
    throw new Error("Audit input must include a non-empty scans array.");
  }
  return input.scans;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function countAdtechDomains(domains: string[]) {
  const patterns = [
    /doubleclick\.net$/i,
    /googlesyndication\.com$/i,
    /googleadservices\.com$/i,
    /adnxs\.com$/i,
    /pubmatic\.com$/i,
    /openx/i,
    /rubiconproject\.com$/i,
    /criteo/i,
    /adsrvr\.org$/i,
    /id5-sync\.com$/i,
    /bidswitch\.net$/i,
    /casalemedia\.com$/i,
    /rlcdn\.com$/i,
    /3lift\.com$/i,
    /crwdcntrl\.net$/i,
    /quantserve\.com$/i,
    /doubleverify\.com$/i,
    /dv\.tech$/i
  ];
  return [...new Set(domains.map((domain) => domain.toLowerCase()))].filter((domain) => patterns.some((pattern) => pattern.test(domain))).length;
}

function compactSyncRows(rows: unknown[]) {
  return rows.slice(0, 8).map((value) => {
    const row = getObject(value);
    return {
      hostname: row.hostname ?? row.host ?? null,
      pathSample: row.pathSample ?? row.path_sample ?? null,
      reason: row.reason ?? null,
      runtimePhase: row.runtimePhase ?? row.runtime_phase ?? null,
      statusCode: row.statusCode ?? row.status_code ?? null,
      queryKeysSample: asArray(row.queryKeysSample ?? row.query_keys_sample).slice(0, 8),
      redirectTargetHost: row.redirectTargetHost ?? row.redirect_target_host ?? null,
      vendor: row.vendor ?? null
    };
  });
}

function classifyRtbBreakPoint(input: {
  endpointRtb: boolean;
  explicitSyncRows: unknown[];
  rtbValidationFinding: ValidationFindingRow | undefined;
  runtimeAdtechDomainCount: number;
}) {
  if (input.endpointRtb && input.rtbValidationFinding) {
    return "projected_rtb_positive";
  }
  if (input.explicitSyncRows.length === 0) {
    return input.runtimeAdtechDomainCount >= 3
      ? "WS01 evidence missing despite adtech-heavy runtime"
      : "sample mix / low retained adtech-sync evidence";
  }
  if (input.explicitSyncRows.length > 0 && !input.rtbValidationFinding) {
    return "WC01 validation finding/mapping gap or evidence contract downgrade";
  }
  if (input.rtbValidationFinding && !input.endpointRtb) {
    return "projection/ranking/counting gap";
  }
  return "needs manual review";
}

function getStringArray(value: unknown) {
  return asArray(value).filter((entry): entry is string => typeof entry === "string");
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

function summarizeTiming(values: Array<number | null>) {
  const finiteValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    count: finiteValues.length,
    avgMs: getAverage(finiteValues),
    p50Ms: percentile(finiteValues, 50),
    p90Ms: percentile(finiteValues, 90),
    p95Ms: percentile(finiteValues, 95)
  };
}

function millisecondsBetweenIso(start: unknown, end: unknown) {
  if (typeof start !== "string" || typeof end !== "string") {
    return null;
  }
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return Number.isFinite(startMs) && Number.isFinite(endMs) ? endMs - startMs : null;
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getNumberRecord(value: unknown) {
  return Object.fromEntries(
    Object.entries(getObject(value))
      .map(([key, recordValue]) => [key, getNumber(recordValue)] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] !== null)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function getLatestEventMetadata(events: TimingEventRow[], eventType: string) {
  const event = [...events].reverse().find((candidate) => candidate.event_type === eventType);
  return event ? getObject(event.metadata_json) : {};
}

function getFirstEvent(events: TimingEventRow[], eventType: string) {
  return events.find((candidate) => candidate.event_type === eventType) ?? null;
}

function getLastEvent(events: TimingEventRow[], eventType: string) {
  return [...events].reverse().find((candidate) => candidate.event_type === eventType) ?? null;
}

function getRuntimeBuildPhaseMetadata(events: TimingEventRow[], phase: string) {
  const diagnostic = [...events]
    .reverse()
    .map((event) => getObject(event.metadata_json))
    .find((metadata) => eventIsRuntimeBuildPhase(metadata, phase));
  if (!diagnostic) {
    return {};
  }
  const successMetadata = getObject(diagnostic.successMetadata);
  const failureMetadata = getObject(diagnostic.failureMetadata);
  if (Object.keys(successMetadata).length > 0) {
    return successMetadata;
  }
  if (Object.keys(failureMetadata).length > 0) {
    return failureMetadata;
  }
  return diagnostic;
}

function eventIsRuntimeBuildPhase(metadata: Record<string, unknown>, phase: string) {
  return metadata.phase === phase || metadata.stepKey === phase;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getObjectArray(value: unknown) {
  return asArray(value).filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
}

function getNestedObject(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function hasFiniteNumber(record: Record<string, unknown> | null | undefined, keys: string[]) {
  return keys.some((key) => getNumber(record?.[key]) !== null);
}

function countHttpLikeStrings(values: unknown[]) {
  return values.filter((value) => typeof value === "string" && /^https?:\/\//i.test(value)).length;
}

function getUrlHost(value: unknown) {
  const raw = getString(value);
  if (!raw || !/^https?:\/\//i.test(raw)) {
    return null;
  }
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getRuntimeHost(row: Record<string, unknown>) {
  return (
    getString(row.hostname) ??
    getString(row.host) ??
    getString(row.domain) ??
    getString(row.requestHost ?? row.request_host) ??
    getUrlHost(row.requestUrl ?? row.request_url ?? row.url) ??
    "unknown"
  ).toLowerCase();
}

function countBy(values: string[]) {
  return Object.fromEntries(
    [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>()).entries()].sort(
      ([left], [right]) => left.localeCompare(right)
    )
  );
}

function summarizeRowsByHost(rows: Record<string, unknown>[]) {
  const byHost = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const host = getRuntimeHost(row);
    byHost.set(host, [...(byHost.get(host) ?? []), row]);
  }

  return [...byHost.entries()]
    .map(([host, hostRows]) => ({
      categoryCounts: countBy(hostRows.map((row) => getString(row.category ?? row.vendorCategory ?? row.vendor_category) ?? "unknown")),
      classificationCounts: countBy(hostRows.map((row) => getString(row.classification ?? row.essentiality) ?? "unknown")),
      confidenceMax: hostRows.reduce((max, row) => Math.max(max, getNumber(row.confidence ?? row.score) ?? 0), 0),
      host,
      resourceTypeCounts: countBy(hostRows.map((row) => getString(row.resourceType ?? row.resource_type) ?? "unknown")),
      rowCount: hostRows.length,
      rowsWithHttpUrl: countHttpLikeStrings(hostRows.map((row) => row.requestUrl ?? row.request_url ?? row.url)),
      serviceClassCounts: countBy(hostRows.map((row) => getString(row.serviceClass ?? row.service_class) ?? "unknown")),
      thirdPartyRows: hostRows.filter((row) => row.thirdParty === true || row.third_party === true).length,
      vendorPresentRows: hostRows.filter((row) => Boolean(getString(row.vendor ?? row.vendorName ?? row.vendor_name))).length,
      vendors: [...new Set(hostRows.map((row) => getString(row.vendor ?? row.vendorName ?? row.vendor_name)).filter(Boolean) as string[])].sort()
    }))
    .sort((left, right) => right.rowCount - left.rowCount || left.host.localeCompare(right.host));
}

function summarizeCookieWriteRows(rows: Record<string, unknown>[]) {
  return {
    beforeConsentRows: rows.length,
    categoryCounts: countBy(rows.map((row) => getString(row.category) ?? "unknown")),
    cookiePartyCounts: countBy(rows.map((row) => getString(row.cookiePartyType ?? row.cookie_party_type) ?? "unknown")),
    nonEssentialRows: rows.filter((row) => row.nonEssential === true || row.non_essential === true).length,
    thirdPartyRows: rows.filter((row) => row.thirdParty === true || row.third_party === true).length,
    timingEvidenceCounts: countBy(rows.map((row) => getString(row.timingEvidence ?? row.timing_evidence) ?? "unknown")),
    vendorPresentRows: rows.filter((row) => Boolean(getString(row.cookieInitiatorVendor ?? row.cookie_initiator_vendor ?? row.vendor))).length
  };
}

function summarizeEvidenceKeys(record: Record<string, unknown> | null | undefined, keys: string[]) {
  return Object.fromEntries(
    keys.map((key) => {
      const value = record?.[key];
      return [
        key,
        Array.isArray(value)
          ? { present: value.length > 0, count: value.length }
          : value && typeof value === "object"
            ? { present: true, count: Object.keys(value as Record<string, unknown>).length }
            : { present: value !== null && value !== undefined, count: value === null || value === undefined ? 0 : 1 }
      ] as const;
    })
  );
}

function summarizeNanoRechecks(events: TimingEventRow[]) {
  const queuedEvents = events.filter((event) => event.event_type === "signals.nano_doc_enrichment_requested");
  const recheckEvents = queuedEvents
    .map((event) => ({
      event,
      metadata: getObject(event.metadata_json)
    }))
    .filter(({ metadata }) => getNumber(metadata.pollCount) !== null || typeof metadata.reason === "string");
  const reasonCounts = new Map<string, number>();
  const delayMs: number[] = [];
  const pollCounts: number[] = [];

  for (const { metadata } of recheckEvents) {
    const reason = typeof metadata.reason === "string" && metadata.reason.trim().length > 0 ? metadata.reason.trim() : "unspecified";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);

    const delay = getNumber(metadata.recheckDelayMs);
    if (delay !== null) {
      delayMs.push(delay);
    }

    const pollCount = getNumber(metadata.pollCount);
    if (pollCount !== null) {
      pollCounts.push(pollCount);
    }
  }

  return {
    queuedEventCount: queuedEvents.length,
    recheckEventCount: recheckEvents.length,
    maxPollCount: pollCounts.length > 0 ? Math.max(...pollCounts) : null,
    recheckDelay: summarizeTiming(delayMs),
    reasons: Object.fromEntries([...reasonCounts.entries()].sort(([left], [right]) => left.localeCompare(right)))
  };
}

function summarizeNanoRecheckRows(rows: Array<{ nanoRechecks: ReturnType<typeof summarizeNanoRechecks> }>) {
  const reasonCounts = new Map<string, number>();
  const delayValues: number[] = [];

  for (const row of rows) {
    for (const [reason, count] of Object.entries(row.nanoRechecks.reasons)) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + count);
    }
    const delaySummary = row.nanoRechecks.recheckDelay;
    if (delaySummary.count > 0) {
      if (delaySummary.p50Ms !== null) delayValues.push(delaySummary.p50Ms);
      if (delaySummary.p90Ms !== null) delayValues.push(delaySummary.p90Ms);
      if (delaySummary.p95Ms !== null) delayValues.push(delaySummary.p95Ms);
    }
  }

  return {
    queuedEventCount: rows.reduce((sum, row) => sum + row.nanoRechecks.queuedEventCount, 0),
    recheckEventCount: rows.reduce((sum, row) => sum + row.nanoRechecks.recheckEventCount, 0),
    maxPollCount: rows.reduce<number | null>(
      (max, row) => row.nanoRechecks.maxPollCount === null ? max : Math.max(max ?? 0, row.nanoRechecks.maxPollCount),
      null
    ),
    sampledRecheckDelay: summarizeTiming(delayValues),
    reasons: Object.fromEntries([...reasonCounts.entries()].sort(([left], [right]) => left.localeCompare(right)))
  };
}

function getScannerExecutionSummary(scanConfig: unknown) {
  const config = getObject(scanConfig);
  const execution = getObject(config.execution);
  return getObject(execution.summary);
}

function getScannerExecutionStages(scanConfig: unknown) {
  const summary = getScannerExecutionSummary(scanConfig);
  return asArray(summary.stages)
    .map((stage) => getObject(stage))
    .map((stage) => ({
      attempts: getNumber(stage.attempts),
      durationMs: getNumber(stage.durationMs),
      errorCategory: getString(stage.errorCategory),
      outcome: getString(stage.outcome),
      recoverable: typeof stage.recoverable === "boolean" ? stage.recoverable : null,
      stage: getString(stage.stage)
    }))
    .filter((stage) => stage.stage);
}

function getBuildPhaseTimingSummary(events: TimingEventRow[]) {
  return getRuntimeBuildPhaseMetadata(events, "build_phase_timing_summary");
}

function getPriorScanAccelerationProfile(scanConfig: unknown) {
  const config = getObject(scanConfig);
  const execution = getObject(config.execution);
  const prior = getObject(execution.priorScanAcceleration);
  return getString(prior.priorHitScanProfile);
}

function getRuntimeBuildPhaseDiagnostics(events: TimingEventRow[]) {
  return events
    .filter((event) => event.event_type === "runtime.build_phase_diagnostic")
    .map((event) => {
      const metadata = getObject(event.metadata_json);
      const successMetadata = getObject(metadata.successMetadata);
      const failureMetadata = getObject(metadata.failureMetadata);
      const detail = Object.keys(successMetadata).length > 0
        ? successMetadata
        : Object.keys(failureMetadata).length > 0
          ? failureMetadata
          : metadata;
      const status = getString(metadata.status ?? detail.status);
      const durationMs = status === "start"
        ? null
        : getNumber(metadata.durationMs) ??
          getNumber(detail.durationMs) ??
          getNumber(metadata.preflightElapsedMs) ??
          getNumber(detail.preflightElapsedMs);
      const rawSubtimings = getObject(metadata.subtimings ?? detail.subtimings);
      const subtimings = Object.fromEntries(
        Object.entries(rawSubtimings)
          .map(([key, value]) => [key, getNumber(value)] as const)
          .filter((entry): entry is readonly [string, number] => entry[1] !== null)
          .sort(([left], [right]) => left.localeCompare(right))
      );
      const discoveryDebug = getObject(metadata.discoveryDebug ?? detail.discoveryDebug);
      return {
        completedAt: getString(metadata.completedAt ?? detail.completedAt),
        discoveryDebug: {
          candidateCount: getNumber(discoveryDebug.candidateCount),
          duplicateCount: getNumber(discoveryDebug.duplicateCount),
          skippedRobotsCount: getNumber(discoveryDebug.skippedRobotsCount)
        },
        buildPhaseCount: getNumber(metadata.buildPhaseCount ?? detail.buildPhaseCount),
        durationMs,
        elapsedMs: getNumber(metadata.elapsedMs) ?? getNumber(detail.elapsedMs) ?? durationMs,
        errorCategory: getString(metadata.errorCategory ?? detail.errorCategory),
        historicalHintResolutionDurationMs: getNumber(metadata.historicalHintResolutionDurationMs ?? detail.historicalHintResolutionDurationMs),
        longestPhase: getString(metadata.longestPhase ?? detail.longestPhase),
        longestPhaseDurationMs: getNumber(metadata.longestPhaseDurationMs ?? detail.longestPhaseDurationMs),
        phaseDurationsMs: getNumberRecord(metadata.phaseDurationsMs ?? detail.phaseDurationsMs),
        phasesByDuration: asArray(metadata.phasesByDuration ?? detail.phasesByDuration)
          .map((entry) => {
            const record = getObject(entry);
            return {
              durationMs: getNumber(record.durationMs),
              outcome: getString(record.outcome),
              phase: getString(record.phase)
            };
          })
          .filter((entry) => entry.phase),
        phase: getString(metadata.phase ?? metadata.stepKey ?? detail.phase ?? detail.stepKey),
        homepageFetchStatus: getString(metadata.homepageFetchStatus ?? detail.homepageFetchStatus),
        homepageSetupSource: getString(metadata.homepageSetupSource ?? detail.homepageSetupSource),
        homepageSetupWaitMs: getNumber(metadata.homepageSetupWaitMs ?? detail.homepageSetupWaitMs),
        preflightAttemptFetchTimings: asArray(metadata.preflightAttemptFetchTimings ?? detail.preflightAttemptFetchTimings)
          .map((entry) => {
            const record = getObject(entry);
            return {
              durationMs: getNumber(record.durationMs),
              fetchStatus: getString(record.fetchStatus),
              source: getString(record.source),
              target: getString(record.target),
              verified: typeof record.verified === "boolean" ? record.verified : null
            };
          })
          .filter((entry) => entry.source && entry.target),
        preflightAttemptRunTimings: asArray(metadata.preflightAttemptRunTimings ?? detail.preflightAttemptRunTimings)
          .map((entry) => {
            const record = getObject(entry);
            return {
              attemptedCount: getNumber(record.attemptedCount),
              blockedCount: getNumber(record.blockedCount),
              concurrent: typeof record.concurrent === "boolean" ? record.concurrent : null,
              durationMs: getNumber(record.durationMs),
              failedCount: getNumber(record.failedCount),
              label: getString(record.label),
              verifiedCount: getNumber(record.verifiedCount)
            };
          })
          .filter((entry) => entry.label),
        preflightAttemptSourceCounts: getObject(metadata.preflightAttemptSourceCounts ?? detail.preflightAttemptSourceCounts),
        preflightAttemptedSourceCounts: getObject(metadata.preflightAttemptedSourceCounts ?? detail.preflightAttemptedSourceCounts),
        preflightHomepageCandidateFetchStatus: getString(
          metadata.preflightHomepageCandidateFetchStatus ?? detail.preflightHomepageCandidateFetchStatus
        ),
        preflightHomepageCandidateDurationMs: getNumber(
          metadata.preflightHomepageCandidateDurationMs ?? detail.preflightHomepageCandidateDurationMs
        ),
        preflightHomepageCandidateFinalUrl: getString(
          metadata.preflightHomepageCandidateFinalUrl ?? detail.preflightHomepageCandidateFinalUrl
        ),
        preflightHomepageCandidateOutcome: getString(
          metadata.preflightHomepageCandidateOutcome ?? detail.preflightHomepageCandidateOutcome
        ),
        preflightHomepageCandidatePageUrl: getString(
          metadata.preflightHomepageCandidatePageUrl ?? detail.preflightHomepageCandidatePageUrl
        ),
        preflightHomepageCandidateWaitMs: getNumber(
          metadata.preflightHomepageCandidateWaitMs ?? detail.preflightHomepageCandidateWaitMs
        ),
        preflightHomepageReuseAccepted:
          typeof (metadata.preflightHomepageReuseAccepted ?? detail.preflightHomepageReuseAccepted) === "boolean"
            ? (metadata.preflightHomepageReuseAccepted ?? detail.preflightHomepageReuseAccepted) as boolean
            : null,
        preflightHomepageReuseReason: getString(metadata.preflightHomepageReuseReason ?? detail.preflightHomepageReuseReason),
        preflightVerifiedSourceCounts: getObject(metadata.preflightVerifiedSourceCounts ?? detail.preflightVerifiedSourceCounts),
        robotsFetchDurationMs: getNumber(metadata.robotsFetchDurationMs ?? detail.robotsFetchDurationMs),
        robotsFetchStatus: getString(metadata.robotsFetchStatus ?? detail.robotsFetchStatus),
        robotsRulesLoaded:
          typeof (metadata.robotsRulesLoaded ?? detail.robotsRulesLoaded) === "boolean"
            ? (metadata.robotsRulesLoaded ?? detail.robotsRulesLoaded) as boolean
            : null,
        robotsStatePrefetchUsed:
          typeof (metadata.robotsStatePrefetchUsed ?? detail.robotsStatePrefetchUsed) === "boolean"
            ? (metadata.robotsStatePrefetchUsed ?? detail.robotsStatePrefetchUsed) as boolean
            : null,
        robotsStateWaitMs: getNumber(metadata.robotsStateWaitMs ?? detail.robotsStateWaitMs),
        status,
        subtimings,
        supplementalDiscoveryTimings: asArray(metadata.supplementalDiscoveryTimings ?? detail.supplementalDiscoveryTimings)
          .map((entry) => {
            const record = getObject(entry);
            return {
              attemptCount: getNumber(record.attemptCount),
              durationMs: getNumber(record.durationMs),
              homepageFetchStatus: getString(record.homepageFetchStatus),
              label: getString(record.label),
              legalHubFetchStatus: getString(record.legalHubFetchStatus),
              legalHubTargetCount: getNumber(record.legalHubTargetCount)
            };
          })
          .filter((entry) => entry.label),
        targetCount: getNumber(metadata.targetCount ?? detail.targetCount),
        totalTrackedDurationMs: getNumber(metadata.totalTrackedDurationMs ?? detail.totalTrackedDurationMs),
        verifiedCount: getNumber(metadata.verifiedCount ?? detail.verifiedCount)
      };
    })
    .filter((phase) => phase.phase);
}

function getRuntimeBrowserPassDiagnostics(events: TimingEventRow[]) {
  return events
    .filter((event) => event.event_type === "runtime.browser_pass_diagnostic")
    .map((event) => {
      const metadata = getObject(event.metadata_json);
      const status = getString(metadata.status);
      const durationMs = status === "start" ? null : getNumber(metadata.durationMs);
      return {
        commitWaitMs: getNumber(metadata.commitWaitMs),
        completedAt: getString(metadata.completedAt),
        domContentLoadedWaitMs: getNumber(metadata.domContentLoadedWaitMs),
        durationMs,
        elapsedMs: getNumber(metadata.elapsedMs) ?? durationMs,
        navigationOutcome: getString(metadata.navigationOutcome),
        stage: getString(metadata.stage ?? metadata.stepKey),
        status,
        totalWaitMs: getNumber(metadata.totalWaitMs),
        timeoutMs: getNumber(metadata.timeoutMs)
      };
    })
    .filter((stage) => stage.stage);
}

function summarizeScannerPhaseRows(rows: Array<{
  buildPhaseTimingSummary: Record<string, unknown>;
  runtimeBrowserPassDiagnostics: ReturnType<typeof getRuntimeBrowserPassDiagnostics>;
  runtimeBuildPhaseDiagnostics: ReturnType<typeof getRuntimeBuildPhaseDiagnostics>;
  scannerStages: ReturnType<typeof getScannerExecutionStages>;
}>) {
  const scannerStageDurations = new Map<string, Array<number | null>>();
  const buildPhaseDurations = new Map<string, Array<number | null>>();
  const browserPassDurations = new Map<string, Array<number | null>>();
  const diagnosticPhaseDurations = new Map<string, Array<number | null>>();
  const diagnosticSubtimingDurations = new Map<string, Array<number | null>>();
  const internalBreakdownDurations = new Map<string, Array<number | null>>();
  const supplementalDiscoveryDurations = new Map<string, Array<number | null>>();

  for (const row of rows) {
    for (const stage of row.scannerStages) {
      const key = stage.stage;
      if (!key) {
        continue;
      }
      const existing = scannerStageDurations.get(key) ?? [];
      existing.push(stage.durationMs);
      scannerStageDurations.set(key, existing);
    }

    for (const [key, value] of Object.entries(row.buildPhaseTimingSummary)) {
      const duration = getNumber(value);
      if (duration === null) {
        continue;
      }
      const existing = buildPhaseDurations.get(key) ?? [];
      existing.push(duration);
      buildPhaseDurations.set(key, existing);
    }

    for (const diagnostic of row.runtimeBuildPhaseDiagnostics) {
      const key = diagnostic.phase;
      if (!key) {
        continue;
      }

      if (diagnostic.durationMs !== null) {
        const existing = diagnosticPhaseDurations.get(key) ?? [];
        existing.push(diagnostic.durationMs);
        diagnosticPhaseDurations.set(key, existing);
      }

      for (const [subtimingKey, value] of Object.entries(diagnostic.subtimings)) {
        const subKey = `${key}.${subtimingKey}`;
        const subExisting = diagnosticSubtimingDurations.get(subKey) ?? [];
        subExisting.push(value);
        diagnosticSubtimingDurations.set(subKey, subExisting);
      }

      for (const [phaseKey, value] of Object.entries(diagnostic.phaseDurationsMs)) {
        const breakdownKey = `${key}.${phaseKey}`;
        const breakdownExisting = internalBreakdownDurations.get(breakdownKey) ?? [];
        breakdownExisting.push(value);
        internalBreakdownDurations.set(breakdownKey, breakdownExisting);
      }

      if (diagnostic.totalTrackedDurationMs !== null) {
        const totalKey = `${key}.totalTrackedDurationMs`;
        const totalExisting = internalBreakdownDurations.get(totalKey) ?? [];
        totalExisting.push(diagnostic.totalTrackedDurationMs);
        internalBreakdownDurations.set(totalKey, totalExisting);
      }

      for (const supplementalTiming of diagnostic.supplementalDiscoveryTimings) {
        if (!supplementalTiming.label || supplementalTiming.durationMs === null) {
          continue;
        }
        const supplementalKey = `${key}.${supplementalTiming.label}`;
        const supplementalExisting = supplementalDiscoveryDurations.get(supplementalKey) ?? [];
        supplementalExisting.push(supplementalTiming.durationMs);
        supplementalDiscoveryDurations.set(supplementalKey, supplementalExisting);
      }
    }

    for (const diagnostic of row.runtimeBrowserPassDiagnostics) {
      const key = diagnostic.stage;
      if (!key || diagnostic.durationMs === null) {
        continue;
      }
      const existing = browserPassDurations.get(key) ?? [];
      existing.push(diagnostic.durationMs);
      browserPassDurations.set(key, existing);
    }
  }

  return {
    buildPhases: Object.fromEntries(
      [...buildPhaseDurations.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([phase, values]) => [phase, summarizeTiming(values)])
    ),
    runtimeBuildPhaseDiagnostics: Object.fromEntries(
      [...diagnosticPhaseDurations.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([phase, values]) => [phase, summarizeTiming(values)])
    ),
    runtimeBuildPhaseSubtimings: Object.fromEntries(
      [...diagnosticSubtimingDurations.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([phase, values]) => [phase, summarizeTiming(values)])
    ),
    runtimeBuildPhaseInternalBreakdowns: Object.fromEntries(
      [...internalBreakdownDurations.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([phase, values]) => [phase, summarizeTiming(values)])
    ),
    supplementalDiscoveryTimings: Object.fromEntries(
      [...supplementalDiscoveryDurations.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([phase, values]) => [phase, summarizeTiming(values)])
    ),
    runtimeBrowserPassDiagnostics: Object.fromEntries(
      [...browserPassDurations.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([stage, values]) => [stage, summarizeTiming(values)])
    ),
    scannerStages: Object.fromEntries(
      [...scannerStageDurations.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([stage, values]) => [stage, summarizeTiming(values)])
    )
  };
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = getNumber(value);
  if (parsed === null) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

async function runPriorScanCandidatesAudit(input: AuditInput) {
  const candidateLimit = clampInteger(input.candidateLimit, 12, 1, 25);
  const sinceDays = clampInteger(input.sinceDays, 30, 1, 30);
  const result = await query<PriorScanCandidateRow>(
    `select s.id::text as scan_id,
            s.domain_id::text as domain_id,
            d.hostname,
            d.normalized_url,
            s.completed_at::text as completed_at,
            count(ds.id)::int as ready_document_count,
            array_remove(array_agg(distinct ds.document_type order by ds.document_type), null) as ready_document_types
       from scans s
       join domains d on d.id = s.domain_id
       join scan_document_sources ds on ds.scan_id = s.id
      where s.scan_type = 'full'
        and s.status = 'completed'
        and s.completed_at >= timezone('utc', now()) - ($1::int * interval '1 day')
        and ds.source_status = 'ready'
        and ds.extraction_status = 'ready'
        and ds.document_type in ('privacy_policy', 'terms_of_service', 'cookie_policy', 'accessibility_statement')
      group by s.id, s.domain_id, d.hostname, d.normalized_url, s.completed_at
     having count(ds.id) >= 2
      order by s.completed_at desc
      limit $2`,
    [sinceDays, candidateLimit],
    { readOnly: true }
  );
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  return {
    audit: "prior-scan-candidates",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      maxRows: candidateLimit,
      sinceDays,
      tables: ["scans", "domains", "scan_document_sources"]
    },
    candidates: result.rows.map((row) => ({
      completedAt: row.completed_at,
      domainId: row.domain_id,
      hostname: row.hostname,
      normalizedUrl: row.normalized_url,
      readyDocumentCount: row.ready_document_count,
      readyDocumentTypes: row.ready_document_types,
      scanId: row.scan_id
    }))
  };
}

function summarizeContinuityRows(rows: SignalContinuityRow[]) {
  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const row of rows) {
    bySource[row.population_source ?? "unknown"] = (bySource[row.population_source ?? "unknown"] ?? 0) + row.signal_count;
    byStatus[row.population_status ?? "unknown"] = (byStatus[row.population_status ?? "unknown"] ?? 0) + row.signal_count;
    byCategory[row.category ?? "unknown"] = (byCategory[row.category ?? "unknown"] ?? 0) + row.signal_count;
  }
  return { byCategory, bySource, byStatus, total: rows.reduce((sum, row) => sum + row.signal_count, 0) };
}

function summarizeRuleRows(rows: ValidationRuleContinuityRow[]) {
  const bySeverity: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const row of rows) {
    bySeverity[row.severity ?? "unknown"] = (bySeverity[row.severity ?? "unknown"] ?? 0) + row.rule_count;
    bySource[row.finding_source ?? "unknown"] = (bySource[row.finding_source ?? "unknown"] ?? 0) + row.rule_count;
  }
  return {
    bySeverity,
    bySource,
    ruleKeys: rows.map((row) => row.rule_key).sort(),
    total: rows.reduce((sum, row) => sum + row.rule_count, 0)
  };
}

async function runSignalFindingContinuityAudit(input: AuditInput) {
  const scans = requireAuditScans(input);
  const scanIds = [...new Set(scans.map((scan) => scan.scanId))];
  const [signalResult, ruleResult, snapshotResult] = await Promise.all([
    query<SignalContinuityRow>(
      `select scan_id::text as scan_id,
              category,
              population_source,
              population_status,
              count(*)::int as signal_count
         from scan_signals
        where scan_id = any($1::uuid[])
        group by scan_id, category, population_source, population_status
        order by scan_id, category, population_source, population_status`,
      [scanIds],
      { readOnly: true }
    ),
    query<ValidationRuleContinuityRow>(
      `select vr.scan_id::text as scan_id,
              vrf.rule_key,
              vrf.severity,
              vrf.finding_source,
              count(*)::int as rule_count
         from validation_runs vr
         join validation_run_findings vrf on vrf.validation_run_id = vr.id
        where vr.scan_id = any($1::uuid[])
        group by vr.scan_id, vrf.rule_key, vrf.severity, vrf.finding_source
        order by vr.scan_id, vrf.rule_key`,
      [scanIds],
      { readOnly: true }
    ),
    query<SnapshotRow>(
      `select scan_id::text as scan_id,
              total_signals,
              cookie_count_total,
              third_party_cookie_count,
              tracker_count_total,
              tracker_vendor_count,
              preconsent_tracking_detected,
              homepage_fetch_status,
              homepage_fetch_http_status,
              scan_outcome,
              access_posture_class,
              report_finding_count
         from scan_snapshots
        where scan_id = any($1::uuid[])`,
      [scanIds],
      { readOnly: true }
    )
  ]);
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  const signalsByScan = new Map<string, SignalContinuityRow[]>();
  for (const row of signalResult.rows) {
    const existing = signalsByScan.get(row.scan_id) ?? [];
    existing.push(row);
    signalsByScan.set(row.scan_id, existing);
  }
  const rulesByScan = new Map<string, ValidationRuleContinuityRow[]>();
  for (const row of ruleResult.rows) {
    const existing = rulesByScan.get(row.scan_id) ?? [];
    existing.push(row);
    rulesByScan.set(row.scan_id, existing);
  }
  const snapshotByScan = new Map(snapshotResult.rows.map((row) => [row.scan_id, row]));

  const rows = scans.map((scan) => {
    const signalSummary = summarizeContinuityRows(signalsByScan.get(scan.scanId) ?? []);
    const ruleSummary = summarizeRuleRows(rulesByScan.get(scan.scanId) ?? []);
    const snapshot = snapshotByScan.get(scan.scanId);
    return {
      batch: scan.batch ?? null,
      domain: scan.domain ?? null,
      scanId: scan.scanId,
      signals: signalSummary,
      validationFindings: ruleSummary,
      snapshot: {
        accessPostureClass: snapshot?.access_posture_class ?? null,
        homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
        homepageFetchStatus: snapshot?.homepage_fetch_status ?? null,
        reportFindingCount: snapshot?.report_finding_count ?? null,
        scanOutcome: snapshot?.scan_outcome ?? null,
        totalSignals: snapshot?.total_signals ?? null
      }
    };
  });

  return {
    audit: "signal-finding-continuity",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      scanCount: scanIds.length,
      tables: ["scan_signals", "scan_snapshots", "validation_runs", "validation_run_findings"]
    },
    rows
  };
}

async function loadScanRecordForProjectionAudit(input: {
  runId: string | null;
  scanId: string;
}) {
  const [
    snapshot,
    runtimeArtifacts,
    preconsentViolations,
    trackerVendors,
    accessibilityRuleCounts,
    accessibilityRuleExamples,
    policyEnrichment,
    documentSources,
    policyReviewQueue,
    signals,
    events,
    validationFindingRows
  ] = await Promise.all([
    queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [input.scanId], { readOnly: true }),
    queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [input.scanId], { readOnly: true }),
    query<Record<string, unknown>>(`select * from scan_preconsent_violations where scan_id = $1`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_tracker_vendors where scan_id = $1`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_accessibility_rule_counts where scan_id = $1`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_accessibility_rule_examples where scan_id = $1`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from policy_enrichment where scan_id = $1 order by created_at asc`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_document_sources where scan_id = $1 order by created_at asc`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from policy_review_queue where scan_id = $1 order by created_at asc`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select category, signal_key, signal_label, signal_value_json, value_type, population_source
         from scan_signals
        where scan_id = $1`,
      [input.scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select id, event_type, message, metadata_json, created_at
         from scan_events
        where scan_id = $1
        order by created_at asc`,
      [input.scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    input.runId
      ? query<ValidationFindingWithVerdictRow>(
          `select id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json
             from validation_run_findings
            where validation_run_id = $1`,
          [input.runId],
          { readOnly: true }
        ).then((result) => result.rows)
      : Promise.resolve([] as ValidationFindingWithVerdictRow[])
  ]);

  const validationFindingIds = validationFindingRows.map((row) => row.id);
  const verdictByFindingId = new Map<string, ValidationVerdictRow>();

  if (validationFindingIds.length > 0) {
    const verdictRows = await query<ValidationVerdictRow>(
      `select validation_run_finding_id, verdict, confidence, rationale, agreement_score, model, prompt_version, system_confidence_score, system_confidence_band, system_confidence_explanation
         from validation_verdicts
        where validation_run_finding_id = any($1::uuid[])
        order by created_at desc`,
      [validationFindingIds],
      { readOnly: true }
    ).then((result) => result.rows);

    for (const row of verdictRows) {
      if (!verdictByFindingId.has(row.validation_run_finding_id)) {
        verdictByFindingId.set(row.validation_run_finding_id, row);
      }
    }
  }

  const normalizedSignals = ((signals ?? []) as Array<Record<string, unknown>>)
    .filter((signal) => !signal.population_source || signal.population_source === "scanner")
    .map((signal) => {
      const category = String(signal.category ?? "");
      const key = String(signal.signal_key ?? "");
      const label = String(signal.signal_label ?? key);
      const taxonomy = mapSignalKeyToTaxonomy({ category, key, label });

      return {
        category,
        key,
        label,
        primaryCategory: taxonomy.primaryCategory,
        primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
        primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
        subcategory: taxonomy.subcategory ?? null,
        value: signal.signal_value_json,
        valueType: String(signal.value_type ?? "unknown")
      };
    });

  const normalizedDocumentSources = (documentSources ?? []) as Array<Record<string, unknown>>;
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources);
  const policySemanticRows = preferDocumentSources
    ? buildNanoPolicyInputsFromDocumentSources(normalizedDocumentSources)
    : ((policyEnrichment ?? []) as Array<Record<string, unknown>>);
  const normalizedPolicyEnrichment = policySemanticRows.map((row, index) => {
    const next = { ...row };
    if (typeof next.id !== "string") {
      next.id = typeof row.source_document_id === "string" ? row.source_document_id : `document-semantic-${index + 1}`;
    }
    delete next.created_at;
    delete next.updated_at;
    return next;
  });
  const repairedEvents = repairFindingFamilyPacketEvents({
    events: ((events ?? []) as Array<Record<string, unknown>>).map((event) => ({
      id: String(event.id ?? ""),
      eventType: String(event.event_type ?? ""),
      message: typeof event.message === "string" ? event.message : "",
      metadataJson: (event.metadata_json as Record<string, unknown> | null) ?? undefined,
      createdAt: String(event.created_at ?? "")
    })),
    policyEnrichment: normalizedPolicyEnrichment
  });

  const mappedValidationFindings: ScanValidationFinding[] = validationFindingRows.map((row) => {
    const verdict = verdictByFindingId.get(row.id) ?? null;
    return {
      agreementScore: verdict?.agreement_score ?? null,
      category: row.category,
      description: row.description,
      evidence: row.evidence_json ?? null,
      findingFamily: row.finding_family,
      findingScope: row.finding_scope,
      findingSource: row.finding_source,
      findingSubject: row.finding_subject,
      id: row.id,
      model: verdict?.model ?? null,
      modelConfidence: verdict?.confidence ?? null,
      pageUrl: row.page_url,
      promptVersion: verdict?.prompt_version ?? null,
      rationale: verdict?.rationale ?? null,
      ruleKey: row.rule_key,
      severity: row.severity,
      subtype: row.subtype,
      systemConfidenceBand: verdict?.system_confidence_band ?? null,
      systemConfidenceExplanation: verdict?.system_confidence_explanation ?? null,
      systemConfidenceScore: verdict?.system_confidence_score ?? null,
      title: row.title,
      verdict: verdict?.verdict ?? null
    };
  });

  return {
    accessibilityRuleCounts: accessibilityRuleCounts as Array<Record<string, unknown>>,
    accessibilityRuleExamples: accessibilityRuleExamples as Array<Record<string, unknown>>,
    events: repairedEvents,
    policyEnrichment: normalizedPolicyEnrichment,
    policyReviewQueue: (policyReviewQueue as Array<Record<string, unknown>>).map((row) => {
      const next = { ...row };
      delete next.created_at;
      delete next.updated_at;
      return next;
    }),
    preconsentViolations: preconsentViolations as Array<Record<string, unknown>>,
    runtimeArtifacts: (runtimeArtifacts as Record<string, unknown> | null) ?? null,
    signals: normalizedSignals,
    snapshot: (snapshot as Record<string, unknown> | null) ?? null,
    trackerVendors: trackerVendors as Array<Record<string, unknown>>,
    validationFindings: mappedValidationFindings
  };
}

function summarizeProjectionPackets(packets: UnifiedFindingDisplayPacket[]) {
  const byStatus: Record<string, number> = {};
  const packetSummaries = packets
    .map((packet) => {
      const status = packet.presentationDecision.status;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      return {
        id: packet.unifiedFindingId,
        severity: packet.severity,
        status,
        verificationState: packet.presentationDecision.verificationState
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id) || left.status.localeCompare(right.status));

  return {
    byStatus,
    idsByStatus: Object.fromEntries(
      ["surface", "audit_only", "suppress"].map((status) => [
        status,
        packetSummaries.filter((packet) => packet.status === status).map((packet) => packet.id)
      ])
    ),
    packetCount: packetSummaries.length,
    packets: packetSummaries
  };
}

async function runUnifiedProjectionContinuityAudit(input: AuditInput) {
  const scans = requireAuditScans(input);
  const scanIds = [...new Set(scans.map((scan) => scan.scanId))];
  const validationRunRows = await query<{ id: string; scan_id: string }>(
    `select distinct on (scan_id) scan_id::text as scan_id, id::text as id
       from validation_runs
      where scan_id = any($1::uuid[])
      order by scan_id, created_at desc`,
    [scanIds],
    { readOnly: true }
  ).then((result) => result.rows);
  const runIdByScanId = new Map(validationRunRows.map((row) => [row.scan_id, row.id]));

  const rows = [];
  for (const scan of scans) {
    const scanRecord = await loadScanRecordForProjectionAudit({
      runId: runIdByScanId.get(scan.scanId) ?? null,
      scanId: scan.scanId
    });
    const packets = buildScanReportUnifiedFindingsForScan(scanRecord);
    rows.push({
      batch: scan.batch ?? null,
      domain: scan.domain ?? null,
      scanId: scan.scanId,
      ...summarizeProjectionPackets(packets)
    });
  }
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  return {
    audit: "unified-projection-continuity",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      scanCount: scanIds.length,
      tables: [
        "scan_snapshots",
        "scan_runtime_artifacts",
        "scan_signals",
        "scan_document_sources",
        "policy_enrichment",
        "validation_runs",
        "validation_run_findings"
      ]
    },
    rows
  };
}

function summarizePreconsentRuntimeArtifacts(runtimeArtifacts: Record<string, unknown> | null) {
  const hybrid = getNestedObject(runtimeArtifacts, ["hybrid_runtime_evidence", "hybridRuntimeEvidence"]);
  const directTimeline = getNestedObject(runtimeArtifacts, ["consentTimeline", "consent_timeline"]);
  const hybridTimeline = getNestedObject(hybrid, ["consentTimeline", "consent_timeline"]);
  const timelineMarkers = getNestedObject(hybrid, ["timelineMarkers", "timeline_markers"]);
  const consentSummary = getNestedObject(hybrid, ["consentSummary", "consent_summary"]);
  const networkSummary = getNestedObject(hybrid, ["networkSummary", "network_summary"]);
  const vendorSummary = getNestedObject(hybrid, ["vendorSummary", "vendor_summary"]);
  const storageSummary = getNestedObject(hybrid, ["storageSummary", "storage_summary"]);
  const requestPurposeRows = [
    ...getObjectArray(runtimeArtifacts?.requestPurposeClassificationConfidence),
    ...getObjectArray(runtimeArtifacts?.request_purpose_classification_confidence),
    ...getObjectArray(hybrid?.requestPurposeClassificationConfidence),
    ...getObjectArray(hybrid?.request_purpose_classification_confidence)
  ];
  const nonEssentialRows = requestPurposeRows.filter((row) => {
    const essentiality = getString(row.essentiality) ?? getString(row.classification);
    const confidence = getNumber(row.confidence ?? row.score) ?? 0;
    return essentiality === "non_essential" && confidence >= 0.7;
  });
  const requestObservationRows = [
    ...getObjectArray(hybrid?.requestObservations),
    ...getObjectArray(hybrid?.request_observations)
  ];
  const preconsentRequestRows = requestObservationRows.filter((row) =>
    row.preConsent === true ||
    row.pre_consent === true ||
    row.runtimePhase === "pre_consent" ||
    row.runtime_phase === "pre_consent"
  );
  const cookieWriteRows = [
    ...getObjectArray(hybrid?.cookieWriteObservations),
    ...getObjectArray(hybrid?.cookie_write_observations)
  ];
  const beforeConsentCookieWriteRows = cookieWriteRows.filter((row) =>
    row.beforeConsent === true ||
    row.before_consent === true ||
    row.runtimePhase === "pre_consent" ||
    row.runtime_phase === "pre_consent"
  );
  const derivedQuality = buildPreconsentEvidenceQualityFallback(runtimeArtifacts);
  const derivedEvidence = derivedQuality as Record<string, unknown> | null;
  const derivedTimeline = getNestedObject(derivedEvidence, ["consentTimeline", "consent_timeline"]);

  return {
    hasRuntimeArtifacts: Boolean(runtimeArtifacts),
    hasHybridRuntimeEvidence: Boolean(hybrid && Object.keys(hybrid).length > 0),
    rawTimingSources: {
      directConsentTimeline: Boolean(directTimeline),
      hybridConsentTimeline: Boolean(hybridTimeline),
      directTimelineFields: {
        firstCmpVisibleMs: getNumber(directTimeline?.firstCmpVisibleMs ?? directTimeline?.first_cmp_visible_ms),
        firstConsentActionMs: getNumber(directTimeline?.firstConsentActionMs ?? directTimeline?.first_consent_action_ms),
        firstNonEssentialRequestMs: getNumber(directTimeline?.firstNonEssentialRequestMs ?? directTimeline?.first_non_essential_request_ms),
        firstTrackingCookieSetMs: getNumber(directTimeline?.firstTrackingCookieSetMs ?? directTimeline?.first_tracking_cookie_set_ms),
        timelineConfidence: getString(directTimeline?.timelineConfidence ?? directTimeline?.timeline_confidence)
      },
      timelineMarkers: {
        hasConsentBannerDetectedMs: hasFiniteNumber(timelineMarkers, ["consentBannerDetectedMs", "consent_banner_detected_ms"]),
        hasConsentChoiceAtMs: hasFiniteNumber(timelineMarkers, [
          "consentChoiceAtMs",
          "consent_choice_at_ms",
          "consentAcceptedAtMs",
          "consentRejectedAtMs"
        ]),
        hasFirstCookieSeenMs: hasFiniteNumber(timelineMarkers, ["firstCookieSeenMs", "first_cookie_seen_ms"]),
        hasFirstRequestMs: hasFiniteNumber(timelineMarkers, ["firstRequestMs", "first_request_ms"]),
        hasFirstThirdPartyRequestMs: hasFiniteNumber(timelineMarkers, ["firstThirdPartyRequestMs", "first_third_party_request_ms"])
      }
    },
    derivedTimingEvidence: {
      present: Boolean(derivedQuality),
      hasConsentTimeline: Boolean(derivedTimeline),
      hasPreconsentSequence: hasPreconsentSequenceEvidence(derivedEvidence),
      hasConcretePreconsentArtifact: hasConcretePreconsentArtifact(derivedEvidence),
      cookieDiagnostic: diagnosePreConsentCookieEvidence(derivedEvidence),
      timelineFields: {
        firstCmpVisibleMs: getNumber(derivedTimeline?.firstCmpVisibleMs ?? derivedTimeline?.first_cmp_visible_ms),
        firstConsentActionMs: getNumber(derivedTimeline?.firstConsentActionMs ?? derivedTimeline?.first_consent_action_ms),
        firstNonEssentialRequestMs: getNumber(derivedTimeline?.firstNonEssentialRequestMs ?? derivedTimeline?.first_non_essential_request_ms),
        firstTrackingCookieSetMs: getNumber(derivedTimeline?.firstTrackingCookieSetMs ?? derivedTimeline?.first_tracking_cookie_set_ms),
        timelineConfidence: getString(derivedTimeline?.timelineConfidence ?? derivedTimeline?.timeline_confidence)
      }
    },
    requestClassification: {
      totalRows: requestPurposeRows.length,
      nonEssentialHighConfidenceRows: nonEssentialRows.length,
      nonEssentialRowsWithUrl: countHttpLikeStrings(nonEssentialRows.map((row) => row.requestUrl ?? row.request_url ?? row.url))
    },
    requestObservations: {
      totalRows: requestObservationRows.length,
      preconsentRows: preconsentRequestRows.length,
      preconsentRowsWithUrl: countHttpLikeStrings(preconsentRequestRows.map((row) => row.url ?? row.requestUrl ?? row.request_url))
    },
    cookieWriteObservations: {
      totalRows: cookieWriteRows.length,
      beforeConsentRows: beforeConsentCookieWriteRows.length,
      nonEssentialBeforeConsentRows: beforeConsentCookieWriteRows.filter((row) => row.nonEssential === true || row.non_essential === true).length
    },
    summaries: {
      preConsentThirdPartyRequestCount: getNumber(networkSummary?.preConsentThirdPartyRequestCount ?? networkSummary?.pre_consent_third_party_request_count),
      preConsentVendorCount: getNumber(vendorSummary?.preConsentVendorCount ?? vendorSummary?.pre_consent_vendor_count),
      preConsentTrackingCookieCount: getNumber(storageSummary?.preConsentTrackingCookieCount ?? storageSummary?.pre_consent_tracking_cookie_count),
      consentSurfaceObserved:
        runtimeArtifacts?.consent_surface_observed === true ||
        runtimeArtifacts?.consentSurfaceObserved === true ||
        consentSummary?.bannerPresent === true ||
        consentSummary?.cmpDetected === true,
      consentActionableChoiceObserved:
        runtimeArtifacts?.consent_actionable_choice_observed === true ||
        runtimeArtifacts?.consentActionableChoiceObserved === true ||
        consentSummary?.managePresent === true ||
        consentSummary?.acceptPresent === true ||
        consentSummary?.rejectPresent === true
    }
  };
}

function summarizePreconsentValidationFinding(finding: ScanValidationFinding | undefined) {
  const evidence = finding?.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence)
    ? finding.evidence as Record<string, unknown>
    : null;
  return {
    present: Boolean(finding),
    severity: finding?.severity ?? null,
    verdict: finding?.verdict ?? null,
    evidenceContract: {
      hasConcretePreconsentArtifact: hasConcretePreconsentArtifact(evidence),
      hasPreconsentSequence: hasPreconsentSequenceEvidence(evidence),
      cookieDiagnostic: diagnosePreConsentCookieEvidence(evidence)
    },
    evidenceKeys: summarizeEvidenceKeys(evidence, [
      "consentTimeline",
      "requestPurposeClassificationConfidence",
      "preconsent_cookie_evidence",
      "preconsent_cookie_timing_evidence",
      "preconsent_tracker_evidence_urls",
      "preconsent_tracker_vendors",
      "runtimeRequestUrls",
      "runtimeVendors",
      "third_party_cookie_count",
      "preconsent_violation_count"
    ]),
    counts: {
      preconsentTrackerEvidenceUrlCount: countHttpLikeStrings(getStringArray(evidence?.preconsent_tracker_evidence_urls)),
      runtimeRequestUrlCount: countHttpLikeStrings(getStringArray(evidence?.runtimeRequestUrls)),
      runtimeVendorCount: getStringArray(evidence?.runtimeVendors).length,
      preconsentTrackerVendorCount: getStringArray(evidence?.preconsent_tracker_vendors).length,
      preconsentCookieEvidenceRows: getObjectArray(evidence?.preconsent_cookie_evidence).length
    }
  };
}

function summarizePreconsentPacket(packet: UnifiedFindingDisplayPacket | undefined) {
  const entities = packet?.evidence?.entities ?? {};
  return {
    present: Boolean(packet),
    status: packet?.presentationDecision.status ?? null,
    verificationState: packet?.presentationDecision.verificationState ?? null,
    decisionState: packet?.surfacingDecision.decisionState ?? null,
    reportLane: packet?.surfacingDecision.reportLane ?? null,
    downgradeReasons: packet?.presentationDecision.downgradeReasons ?? [],
    decisionReasons: packet?.surfacingDecision.decisionReasons ?? [],
    concernContext: packet?.concernContext
      ? {
          assertionLevels: packet.concernContext.assertionLevels,
          externalSurfacingEligibilities: packet.concernContext.externalSurfacingEligibilities,
          negativeEvidenceFlags: packet.concernContext.negativeEvidenceFlags,
          promotionEligibilities: packet.concernContext.promotionEligibilities
        }
      : null,
    evidenceEntityCounts: {
      consentTimeline: entities.consentTimeline?.length ?? 0,
      preconsentCookieEvidence: entities.preconsent_cookie_evidence?.length ?? 0,
      preconsentCookieTimingEvidence: entities.preconsent_cookie_timing_evidence?.length ?? 0,
      preconsentTrackerEvidenceUrls: entities.preconsent_tracker_evidence_urls?.length ?? 0,
      preconsentTrackerVendors: entities.preconsent_tracker_vendors?.length ?? 0,
      runtimeRequestUrls: entities.runtimeRequestUrls?.length ?? 0,
      runtimeVendors: entities.runtimeVendors?.length ?? 0
    },
    sourceRefs: {
      validationRuleKeys: packet?.sourceRefs.flatMap((sourceRef) => sourceRef.kind === "validation" ? [sourceRef.ruleKey] : []) ?? [],
      signalKeys: packet?.sourceRefs.flatMap((sourceRef) => sourceRef.kind === "signal" ? [sourceRef.key] : []) ?? []
    }
  };
}

async function runPreconsentTimingEvidenceAudit(input: AuditInput) {
  const scans = requireAuditScans(input);
  const scanIds = [...new Set(scans.map((scan) => scan.scanId))];
  const validationRunRows = await query<{ id: string; scan_id: string }>(
    `select distinct on (scan_id) scan_id::text as scan_id, id::text as id
       from validation_runs
      where scan_id = any($1::uuid[])
      order by scan_id, created_at desc`,
    [scanIds],
    { readOnly: true }
  ).then((result) => result.rows);
  const runIdByScanId = new Map(validationRunRows.map((row) => [row.scan_id, row.id]));

  const rows = [];
  for (const scan of scans) {
    const scanRecord = await loadScanRecordForProjectionAudit({
      runId: runIdByScanId.get(scan.scanId) ?? null,
      scanId: scan.scanId
    });
    const snapshot = scanRecord.snapshot;
    const validationFinding = scanRecord.validationFindings.find(
      (finding) => finding.ruleKey === "runtime_privacy.preconsent_tracking_observed"
    );
    const packets = buildScanReportUnifiedFindingsForScan(scanRecord);
    const preconsentPacket = packets.find((packet) => packet.unifiedFindingId === "preconsent_tracking");
    const preconsentViolations = scanRecord.preconsentViolations;

    rows.push({
      batch: scan.batch ?? null,
      domain: scan.domain ?? null,
      scanId: scan.scanId,
      snapshot: {
        cookieCountTotal: getNumber(snapshot?.cookie_count_total),
        preconsentTrackingDetected: snapshot?.preconsent_tracking_detected === true,
        reportFindingCount: getNumber(snapshot?.report_finding_count),
        thirdPartyCookieCount: getNumber(snapshot?.third_party_cookie_count),
        trackerVendorCount: getNumber(snapshot?.tracker_vendor_count)
      },
      preconsentViolationTable: {
        rowCount: preconsentViolations.length,
        rowsWithEvidenceUrls: preconsentViolations.filter((row) => countHttpLikeStrings(getStringArray(row.evidence_urls ?? row.evidenceUrls)) > 0).length,
        vendorCount: new Set(preconsentViolations.flatMap((row) => getString(row.vendor_name ?? row.vendorName) ?? [])).size
      },
      runtimeArtifacts: summarizePreconsentRuntimeArtifacts(scanRecord.runtimeArtifacts),
      validationFinding: summarizePreconsentValidationFinding(validationFinding),
      unifiedPacket: summarizePreconsentPacket(preconsentPacket),
      lineageInterpretation: {
        timingLoggedInRuntime:
          summarizePreconsentRuntimeArtifacts(scanRecord.runtimeArtifacts).rawTimingSources.directConsentTimeline ||
          summarizePreconsentRuntimeArtifacts(scanRecord.runtimeArtifacts).rawTimingSources.hybridConsentTimeline ||
          summarizePreconsentRuntimeArtifacts(scanRecord.runtimeArtifacts).derivedTimingEvidence.hasConsentTimeline,
        timingCarriedInValidationFinding:
          Boolean(validationFinding?.evidence && typeof validationFinding.evidence === "object" && !Array.isArray(validationFinding.evidence) &&
            (validationFinding.evidence as Record<string, unknown>).consentTimeline),
        projectedPreconsentPacketStatus: preconsentPacket?.presentationDecision.status ?? null
      }
    });
  }
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  return {
    audit: "preconsent-timing-evidence",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      scanCount: scanIds.length,
      tables: [
        "scan_snapshots",
        "scan_runtime_artifacts",
        "scan_preconsent_violations",
        "scan_tracker_vendors",
        "validation_runs",
        "validation_run_findings",
        "validation_verdicts"
      ]
    },
    rows
  };
}

async function runPreconsentAnchorClassificationAudit(input: AuditInput) {
  const scans = requireAuditScans(input);
  const scanIds = [...new Set(scans.map((scan) => scan.scanId))];
  const rows = [];

  for (const scan of scans) {
    const scanRecord = await loadScanRecordForProjectionAudit({
      runId: null,
      scanId: scan.scanId
    });
    const runtimeArtifacts = scanRecord.runtimeArtifacts;
    const hybrid = getNestedObject(runtimeArtifacts, ["hybrid_runtime_evidence", "hybridRuntimeEvidence"]);
    const requestPurposeRows = [
      ...getObjectArray(runtimeArtifacts?.requestPurposeClassificationConfidence),
      ...getObjectArray(runtimeArtifacts?.request_purpose_classification_confidence),
      ...getObjectArray(hybrid?.requestPurposeClassificationConfidence),
      ...getObjectArray(hybrid?.request_purpose_classification_confidence)
    ];
    const requestObservationRows = [
      ...getObjectArray(hybrid?.requestObservations),
      ...getObjectArray(hybrid?.request_observations)
    ];
    const state0Rows = [
      ...getObjectArray(hybrid?.preconsentState0RequestObservations),
      ...getObjectArray(hybrid?.preconsent_state0_request_observations)
    ];
    const preconsentRequestRows = requestObservationRows.filter((row) =>
      row.preConsent === true ||
      row.pre_consent === true ||
      row.runtimePhase === "pre_consent" ||
      row.runtime_phase === "pre_consent"
    );
    const cookieWriteRows = [
      ...getObjectArray(hybrid?.cookieWriteObservations),
      ...getObjectArray(hybrid?.cookie_write_observations)
    ];
    const beforeConsentCookieWriteRows = cookieWriteRows.filter((row) =>
      row.beforeConsent === true ||
      row.before_consent === true ||
      row.runtimePhase === "pre_consent" ||
      row.runtime_phase === "pre_consent"
    );
    const nonEssentialRows = requestPurposeRows.filter((row) => {
      const essentiality = getString(row.essentiality) ?? getString(row.classification);
      const confidence = getNumber(row.confidence ?? row.score) ?? 0;
      return essentiality === "non_essential" && confidence >= 0.7;
    });
    const packets = buildScanReportUnifiedFindingsForScan(scanRecord);
    const preconsentPacket = packets.find((packet) => packet.unifiedFindingId === "preconsent_tracking");

    rows.push({
      batch: scan.batch ?? null,
      domain: scan.domain ?? null,
      scanId: scan.scanId,
      anchorSummary: {
        beforeConsentCookieRows: beforeConsentCookieWriteRows.length,
        highConfidenceNonEssentialRequestRows: nonEssentialRows.length,
        preconsentRequestObservationRows: preconsentRequestRows.length,
        preconsentRequestRowsWithHttpUrl: countHttpLikeStrings(preconsentRequestRows.map((row) => row.requestUrl ?? row.request_url ?? row.url)),
        requestClassificationRows: requestPurposeRows.length,
        requestObservationRows: requestObservationRows.length,
        state0Rows: state0Rows.length,
        state0RowsWithHttpUrl: countHttpLikeStrings(state0Rows.map((row) => row.requestUrl ?? row.request_url ?? row.url))
      },
      beforeConsentCookieWriteEvidence: summarizeCookieWriteRows(beforeConsentCookieWriteRows),
      preconsentPacket: {
        decisionState: preconsentPacket?.surfacingDecision.decisionState ?? null,
        status: preconsentPacket?.presentationDecision.status ?? null
      },
      preconsentRequestObservationHosts: summarizeRowsByHost(preconsentRequestRows),
      requestClassificationHosts: summarizeRowsByHost(requestPurposeRows).slice(0, 25),
      state0Hosts: summarizeRowsByHost(state0Rows)
    });
  }
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  return {
    audit: "preconsent-anchor-classification",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      scanCount: scanIds.length,
      tables: [
        "scan_snapshots",
        "scan_runtime_artifacts",
        "scan_signals",
        "scan_document_sources",
        "policy_enrichment",
        "validation_runs",
        "validation_run_findings"
      ]
    },
    sanitization: {
      cookies: "names/domains omitted",
      requestUrls: "omitted; host-level aggregates only"
    },
    rows
  };
}

async function runScanTimingAudit(input: AuditInput) {
  const scans = requireAuditScans(input);
  const scanIds = [...new Set(scans.map((scan) => scan.scanId))];
  const [scanResult, eventResult, signalCountResult, documentCountResult, findingCountResult] = await Promise.all([
    query<TimingScanRow>(
      `select id::text as id,
              status,
              created_at::text as created_at,
              completed_at::text as completed_at
         from scans
        where id = any($1::uuid[])`,
      [scanIds],
      { readOnly: true }
    ),
    query<TimingEventRow>(
      `select scan_id::text as scan_id,
              event_type,
              created_at::text as created_at,
              metadata_json
         from scan_events
        where scan_id = any($1::uuid[])
        order by scan_id, created_at asc`,
      [scanIds],
      { readOnly: true }
    ),
    query<TimingSignalCountRow>(
      `select scan_id::text as scan_id,
              count(*) filter (where population_source = 'scanner')::int as scanner_signal_count,
              count(*) filter (where population_source = 'nano')::int as nano_signal_count
         from scan_signals
        where scan_id = any($1::uuid[])
        group by scan_id`,
      [scanIds],
      { readOnly: true }
    ),
    query<TimingDocumentCountRow>(
      `select scan_id::text as scan_id,
              count(*)::int as document_source_count,
              count(*) filter (where source_status = 'ready')::int as policy_document_count
         from scan_document_sources
        where scan_id = any($1::uuid[])
        group by scan_id`,
      [scanIds],
      { readOnly: true }
    ),
    query<TimingFindingCountRow>(
      `select vr.scan_id::text as scan_id,
              count(vrf.id)::int as finding_count
         from validation_runs vr
         left join validation_run_findings vrf on vrf.validation_run_id = vr.id
        where vr.scan_id = any($1::uuid[])
        group by vr.scan_id`,
      [scanIds],
      { readOnly: true }
    )
  ]);
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  const scansById = new Map(scanResult.rows.map((row) => [row.id, row]));
  const eventsByScan = new Map<string, TimingEventRow[]>();
  for (const event of eventResult.rows) {
    const existing = eventsByScan.get(event.scan_id) ?? [];
    existing.push(event);
    eventsByScan.set(event.scan_id, existing);
  }
  const signalsByScan = new Map(signalCountResult.rows.map((row) => [row.scan_id, row]));
  const documentsByScan = new Map(documentCountResult.rows.map((row) => [row.scan_id, row]));
  const findingsByScan = new Map(findingCountResult.rows.map((row) => [row.scan_id, row]));

  const rows = scans.map((inputScan) => {
    const scan = scansById.get(inputScan.scanId);
    const events = eventsByScan.get(inputScan.scanId) ?? [];
    const signals = signalsByScan.get(inputScan.scanId);
    const documents = documentsByScan.get(inputScan.scanId);
    const findings = findingsByScan.get(inputScan.scanId);
    const workflow = deriveSignalEnrichmentWorkflowState({
      documentSourceCount: documents?.document_source_count ?? 0,
      events: events.map((event) => ({
        createdAt: event.created_at,
        eventType: event.event_type,
        metadataJson: event.metadata_json
      })),
      findingsCount: findings?.finding_count ?? 0,
      mergedSignalCount: (signals?.scanner_signal_count ?? 0) + (signals?.nano_signal_count ?? 0),
      nanoSignalCount: signals?.nano_signal_count ?? 0,
      policyDocumentCount: documents?.policy_document_count ?? 0,
      scanCompletedAt: scan?.completed_at ?? null,
      scanStatus: scan?.status ?? null,
      scannerSignalCount: signals?.scanner_signal_count ?? 0
    });

    return {
      batch: inputScan.batch ?? null,
      manifestRow: inputScan.manifestRow ?? null,
      scanId: inputScan.scanId,
      status: scan?.status ?? "missing",
      actualMode: workflow.actualMode,
      findingsReady: workflow.findingsReady,
      mergedSignalsReady: workflow.mergedSignalsReady,
      eventCount: events.length,
      nanoRechecks: summarizeNanoRechecks(events),
      signalCounts: {
        nano: signals?.nano_signal_count ?? 0,
        scanner: signals?.scanner_signal_count ?? 0
      },
      timings: workflow.timings
    };
  });

  return {
    audit: "scan-timing",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      scanCount: scanIds.length,
      tables: ["scans", "scan_events", "scan_signals", "scan_document_sources", "validation_runs", "validation_run_findings"]
    },
    summary: {
      queuePickupLatency: summarizeTiming(rows.map((row) => row.timings.queuePickupLatencyMs)),
      scannerRuntime: summarizeTiming(rows.map((row) => row.timings.scannerRuntimeMs)),
      nanoDocSignals: summarizeTiming(rows.map((row) => row.timings.nanoDocSignalsDurationMs)),
      nanoRechecks: summarizeNanoRecheckRows(rows),
      projectionRecovery: summarizeTiming(rows.map((row) => row.timings.projectionRecoveryLatencyMs)),
      projectionRecoveryModes: rows.reduce<Record<string, number>>((counts, row) => {
        const mode = row.timings.projectionRecoveryMode;
        if (mode) {
          counts[mode] = (counts[mode] ?? 0) + 1;
        }
        return counts;
      }, {}),
      signalMerge: summarizeTiming(rows.map((row) => row.timings.signalMergeDurationMs)),
      unifiedFindings: summarizeTiming(rows.map((row) => row.timings.unifiedFindingsDurationMs)),
      timeToFirstUsefulReport: summarizeTiming(rows.map((row) => row.timings.timeToFirstUsefulReportMs)),
      timeToFinalReport: summarizeTiming(rows.map((row) => row.timings.timeToFinalReportMs))
    },
    rows
  };
}

async function runScannerPhaseTimingAudit(input: AuditInput) {
  const scans = requireAuditScans(input);
  const scanIds = [...new Set(scans.map((scan) => scan.scanId))];
  const [scanResult, eventResult] = await Promise.all([
    query<TimingScanRow>(
      `select id::text as id,
              status,
              created_at::text as created_at,
              started_at::text as started_at,
              completed_at::text as completed_at,
              scan_config_json
         from scans
        where id = any($1::uuid[])`,
      [scanIds],
      { readOnly: true }
    ),
    query<TimingEventRow>(
      `select scan_id::text as scan_id,
              event_type,
              created_at::text as created_at,
              metadata_json
         from scan_events
        where scan_id = any($1::uuid[])
          and (
            event_type in ('full_scan.started', 'full_scan.completed', 'runtime.build_phase_diagnostic', 'runtime.browser_pass_diagnostic')
            or metadata_json ? 'scannerExecution'
          )
        order by scan_id, created_at asc`,
      [scanIds],
      { readOnly: true }
    )
  ]);
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  const scansById = new Map(scanResult.rows.map((row) => [row.id, row]));
  const eventsByScan = new Map<string, TimingEventRow[]>();
  for (const event of eventResult.rows) {
    const existing = eventsByScan.get(event.scan_id) ?? [];
    existing.push(event);
    eventsByScan.set(event.scan_id, existing);
  }

  const rows = scans.map((inputScan) => {
    const scan = scansById.get(inputScan.scanId);
    const events = eventsByScan.get(inputScan.scanId) ?? [];
    const scannerStages = getScannerExecutionStages(scan?.scan_config_json);
    const buildPhaseTimingSummary = getBuildPhaseTimingSummary(events);
    const runtimeBuildPhaseDiagnostics = getRuntimeBuildPhaseDiagnostics(events);
    const runtimeBrowserPassDiagnostics = getRuntimeBrowserPassDiagnostics(events);

    return {
      batch: inputScan.batch ?? null,
      buildPhaseTimingSummary,
      completedAt: scan?.completed_at ?? null,
      createdAt: scan?.created_at ?? null,
      manifestRow: inputScan.manifestRow ?? null,
      priorScanAccelerationProfile: getPriorScanAccelerationProfile(scan?.scan_config_json),
      runtimeBrowserPassDiagnostics,
      runtimeBrowserPassDiagnosticCount: runtimeBrowserPassDiagnostics.length,
      runtimeBuildPhaseDiagnostics,
      runtimeBuildPhaseDiagnosticCount: runtimeBuildPhaseDiagnostics.length,
      scanId: inputScan.scanId,
      scannerStages,
      scannerWallMs: millisecondsBetweenIso(scan?.started_at, scan?.completed_at),
      startedAt: scan?.started_at ?? null,
      status: scan?.status ?? "missing"
    };
  });

  return {
    audit: "scanner-phase-timing",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      scanCount: scanIds.length,
      tables: ["scans", "scan_events"]
    },
    summary: {
      scannerWall: summarizeTiming(rows.map((row) => row.scannerWallMs)),
      ...summarizeScannerPhaseRows(rows)
    },
    rows
  };
}

async function runPriorScanAccelerationAudit(input: AuditInput) {
  const scans = requireAuditScans(input);
  const scanIds = [...new Set(scans.map((scan) => scan.scanId))];
  const [scanResult, eventResult, documentResult] = await Promise.all([
    query<PriorScanAccelerationScanRow>(
      `select id::text as id,
              status,
              pages_scanned,
              started_at::text as started_at,
              completed_at::text as completed_at,
              scan_config_json
         from scans
        where id = any($1::uuid[])`,
      [scanIds],
      { readOnly: true }
    ),
    query<TimingEventRow>(
      `select scan_id::text as scan_id,
              event_type,
              created_at::text as created_at,
              metadata_json
         from scan_events
        where scan_id = any($1::uuid[])
        order by scan_id, created_at asc`,
      [scanIds],
      { readOnly: true }
    ),
    query<PriorScanAccelerationDocumentRow>(
      `select scan_id::text as scan_id,
              document_type,
              source_status,
              extraction_status
         from scan_document_sources
        where scan_id = any($1::uuid[])`,
      [scanIds],
      { readOnly: true }
    )
  ]);
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  const scansById = new Map(scanResult.rows.map((row) => [row.id, row]));
  const eventsByScan = new Map<string, TimingEventRow[]>();
  for (const event of eventResult.rows) {
    const existing = eventsByScan.get(event.scan_id) ?? [];
    existing.push(event);
    eventsByScan.set(event.scan_id, existing);
  }
  const documentsByScan = new Map<string, PriorScanAccelerationDocumentRow[]>();
  for (const document of documentResult.rows) {
    const existing = documentsByScan.get(document.scan_id) ?? [];
    existing.push(document);
    documentsByScan.set(document.scan_id, existing);
  }

  const rows = scans.map((inputScan) => {
    const scan = scansById.get(inputScan.scanId);
    const events = eventsByScan.get(inputScan.scanId) ?? [];
    const documents = documentsByScan.get(inputScan.scanId) ?? [];
    const config = getObject(scan?.scan_config_json);
    const execution = getObject(config.execution);
    const prior = getObject(execution.priorScanAcceleration);
    const crawlSeedHints = asArray(execution.crawlSeedHints).map((hint) => getObject(hint));
    const nanoEvents = events
      .filter((event) => event.event_type === "signals.nano_doc_enrichment_completed")
      .map((event) => getObject(event.metadata_json));
    const latestNano = nanoEvents[nanoEvents.length - 1] ?? {};
    const reuseNano = nanoEvents.find((event) => getNumber(event.reusableExtractionAcceptedCount) !== null) ?? latestNano;
    const preflightMetadata = getRuntimeBuildPhaseMetadata(events, "urlscan_preflight_legal_fetch");
    const readyDocumentTypes = [
      ...new Set(
        documents
          .filter((document) => document.source_status === "ready" && document.extraction_status === "ready")
          .map((document) => document.document_type)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      )
    ].sort();
    const crawlSeedHintTypes = [
      ...new Set(crawlSeedHints.map((hint) => getString(hint.hintType)).filter((value): value is string => Boolean(value)))
    ].sort();

    return {
      batch: inputScan.batch ?? null,
      crawlSeedHintCount: crawlSeedHints.length,
      crawlSeedHintTypes,
      firstUnifiedFindingMs: millisecondsBetweenIso(scan?.started_at, getFirstEvent(events, "findings.unified_derivation_completed")?.created_at),
      freshExtractionAttemptCount: getNumber(latestNano.freshExtractionAttemptCount) ?? 0,
      freshExtractionDurationMs: getNumber(latestNano.freshExtractionDurationMs) ?? 0,
      freshExtractionTotalTokenCount: getNumber(latestNano.freshExtractionTotalTokenCount) ?? 0,
      manifestRow: inputScan.manifestRow ?? null,
      nanoRetrievalMs: millisecondsBetweenIso(
        getFirstEvent(events, "signals.nano_doc_retrieval_started")?.created_at,
        getLastEvent(events, "signals.nano_doc_retrieval_completed")?.created_at
      ),
      pagesScanned: scan?.pages_scanned ?? null,
      priorHintAttemptCount: getNumber(preflightMetadata.priorScanHintAttemptCount) ?? 0,
      priorHintAttemptedCount: getNumber(preflightMetadata.priorScanHintAttemptedCount) ?? 0,
      priorHintVerifiedCount: getNumber(preflightMetadata.priorScanHintVerifiedCount) ?? 0,
      priorHit: Boolean(prior.sourceScanId),
      priorScanSelectionReason: getString(prior.priorScanSelectionReason),
      priorScanSelectionScore: getNumber(prior.priorScanSelectionScore),
      readyDocumentTypes,
      reusableExtractionAcceptedCount: getNumber(reuseNano.reusableExtractionAcceptedCount) ?? 0,
      reusableExtractionCandidateCount: getNumber(reuseNano.reusableExtractionCandidateCount) ?? 0,
      reusableExtractionModelCallAvoidedCount: getNumber(reuseNano.reusableExtractionModelCallAvoidedCount) ?? 0,
      scanId: inputScan.scanId,
      scannerWallMs: millisecondsBetweenIso(scan?.started_at, scan?.completed_at),
      sourceScanId: getString(prior.sourceScanId),
      status: scan?.status ?? "missing"
    };
  });

  const priorHitRows = rows.filter((row) => row.priorHit);
  const hintTypes = [...new Set(rows.flatMap((row) => row.crawlSeedHintTypes))].sort();
  const attemptedHints = rows.reduce((sum, row) => sum + row.priorHintAttemptedCount, 0);

  return {
    audit: "prior-scan-acceleration",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      scanCount: scanIds.length,
      tables: ["scans", "scan_events", "scan_document_sources"]
    },
    summary: {
      firstUnifiedFinding: summarizeTiming(rows.map((row) => row.firstUnifiedFindingMs)),
      nanoRetrieval: summarizeTiming(rows.map((row) => row.nanoRetrievalMs)),
      priorHitRate: rows.length > 0 ? priorHitRows.length / rows.length : 0,
      scannerWall: summarizeTiming(rows.map((row) => row.scannerWallMs)),
      totalFreshExtractionAttempts: rows.reduce((sum, row) => sum + row.freshExtractionAttemptCount, 0),
      totalPriorHintAttemptCount: rows.reduce((sum, row) => sum + row.priorHintAttemptCount, 0),
      totalPriorHintAttemptedCount: attemptedHints,
      totalPriorHintVerifiedCount: rows.reduce((sum, row) => sum + row.priorHintVerifiedCount, 0),
      totalReusableExtractionsAccepted: rows.reduce((sum, row) => sum + row.reusableExtractionAcceptedCount, 0),
      totalReusableModelCallsAvoided: rows.reduce((sum, row) => sum + row.reusableExtractionModelCallAvoidedCount, 0),
      priorHintVerificationRate:
        attemptedHints > 0
          ? rows.reduce((sum, row) => sum + row.priorHintVerifiedCount, 0) / attemptedHints
          : 0,
      hintTypeAcceptance: Object.fromEntries(
        hintTypes.map((hintType) => {
          const hintedRows = rows.filter((row) => row.crawlSeedHintTypes.includes(hintType));
          const acceptedRows = hintedRows.filter((row) => row.readyDocumentTypes.includes(hintType));
          return [
            hintType,
            {
              acceptedScanCount: acceptedRows.length,
              hintedScanCount: hintedRows.length,
              scanAcceptanceRate: hintedRows.length > 0 ? acceptedRows.length / hintedRows.length : 0
            }
          ];
        })
      )
    },
    rows
  };
}

async function runRtbCookieSyncAudit(input: AuditInput) {
  const scans = requireAuditScans(input);
  const scanIds = [...new Set(scans.map((scan) => scan.scanId))];
  const [runtimeResult, snapshotResult, validationResult, eventResult] = await Promise.all([
    query<RuntimeArtifactRow>(
      `select scan_id::text as scan_id,
              third_party_request_count,
              third_party_request_domains,
              hybrid_runtime_evidence,
              created_at::text as created_at
         from scan_runtime_artifacts
        where scan_id = any($1::uuid[])`,
      [scanIds],
      { readOnly: true }
    ),
    query<SnapshotRow>(
      `select scan_id::text as scan_id,
              total_signals,
              cookie_count_total,
              third_party_cookie_count,
              tracker_count_total,
              tracker_vendor_count,
              preconsent_tracking_detected,
              homepage_fetch_status,
              homepage_fetch_http_status,
              scan_outcome,
              access_posture_class,
              report_finding_count
         from scan_snapshots
        where scan_id = any($1::uuid[])`,
      [scanIds],
      { readOnly: true }
    ),
    query<ValidationFindingRow>(
      `select vr.scan_id::text as scan_id,
              vrf.rule_key,
              vrf.severity,
              vrf.finding_source,
              vrf.evidence_json
         from validation_runs vr
         join validation_run_findings vrf on vrf.validation_run_id = vr.id
        where vr.scan_id = any($1::uuid[])
          and (vrf.rule_key = 'runtime_privacy.rtb_cookie_sync_observed' or vrf.rule_key like 'runtime_privacy.%')`,
      [scanIds],
      { readOnly: true }
    ),
    query<EventCountRow>(
      `select scan_id::text as scan_id, event_type, count(*)::int as count
         from scan_events
        where scan_id = any($1::uuid[])
        group by scan_id, event_type
        order by scan_id, event_type`,
      [scanIds],
      { readOnly: true }
    )
  ]);
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  const runtimeByScan = new Map(runtimeResult.rows.map((row) => [row.scan_id, row]));
  const snapshotByScan = new Map(snapshotResult.rows.map((row) => [row.scan_id, row]));
  const validationByScan = new Map<string, ValidationFindingRow[]>();
  for (const row of validationResult.rows) {
    const existing = validationByScan.get(row.scan_id) ?? [];
    existing.push(row);
    validationByScan.set(row.scan_id, existing);
  }
  const eventsByScan = new Map<string, Record<string, number>>();
  for (const row of eventResult.rows) {
    const existing = eventsByScan.get(row.scan_id) ?? {};
    existing[row.event_type] = row.count;
    eventsByScan.set(row.scan_id, existing);
  }

  const rows = scans.map((scan) => {
    const runtime = runtimeByScan.get(scan.scanId);
    const snapshot = snapshotByScan.get(scan.scanId);
    const validationFindings = validationByScan.get(scan.scanId) ?? [];
    const hybrid = getObject(runtime?.hybrid_runtime_evidence);
    const explicitSyncRows = asArray(hybrid.rtbCookieSyncObservations ?? hybrid.rtb_cookie_sync_observations);
    const requestObservations = asArray(hybrid.requestObservations);
    const vendorSummary = getObject(hybrid.vendorSummary);
    const domains = getStringArray(runtime?.third_party_request_domains);
    const rtbValidationFinding = validationFindings.find((finding) => finding.rule_key === "runtime_privacy.rtb_cookie_sync_observed");
    const endpointFindingCounts = scan.endpointFindingCounts ?? {};
    const runtimeAdtechDomainCount = countAdtechDomains(domains);
    return {
      batch: scan.batch ?? null,
      domain: scan.domain ?? null,
      manifestRow: scan.manifestRow ?? null,
      trancoRank: scan.trancoRank ?? null,
      scanId: scan.scanId,
      endpoint: {
        findingCounts: endpointFindingCounts,
        hasRtbFindingCount: Number(endpointFindingCounts.rtb_cookie_sync_observed ?? 0) > 0,
        topFindingIds: scan.endpointTopFindingIds ?? []
      },
      snapshot: snapshot
        ? {
            accessPostureClass: snapshot.access_posture_class,
            cookieCountTotal: snapshot.cookie_count_total,
            homepageFetchHttpStatus: snapshot.homepage_fetch_http_status,
            homepageFetchStatus: snapshot.homepage_fetch_status,
            preconsentTrackingDetected: snapshot.preconsent_tracking_detected,
            reportFindingCount: snapshot.report_finding_count,
            scanOutcome: snapshot.scan_outcome,
            thirdPartyCookieCount: snapshot.third_party_cookie_count,
            totalSignals: snapshot.total_signals,
            trackerCountTotal: snapshot.tracker_count_total,
            trackerVendorCount: snapshot.tracker_vendor_count
          }
        : null,
      runtime: runtime
        ? {
            adtechDomainCount: runtimeAdtechDomainCount,
            explicitRtbCookieSyncObservationCount: explicitSyncRows.length,
            normalizedVendorCount: getStringArray(vendorSummary.normalizedVendors).length,
            normalizedVendorsSample: getStringArray(vendorSummary.normalizedVendors).slice(0, 12),
            rawThirdPartyDomainsSample: domains.slice(0, 24),
            requestObservationCount: requestObservations.length,
            rtbCookieSyncEvidenceSample: compactSyncRows(explicitSyncRows),
            thirdPartyRequestCount: runtime.third_party_request_count,
            thirdPartyRequestDomainCount: domains.length
          }
        : null,
      validation: {
        hasRtbValidationFinding: Boolean(rtbValidationFinding),
        rtbEvidenceKeys:
          rtbValidationFinding?.evidence_json && typeof rtbValidationFinding.evidence_json === "object"
            ? Object.keys(rtbValidationFinding.evidence_json as Record<string, unknown>).sort()
            : [],
        rtbValidationSeverity: rtbValidationFinding?.severity ?? null,
        runtimePrivacyFindingRuleKeys: validationFindings.map((finding) => finding.rule_key).sort()
      },
      events: eventsByScan.get(scan.scanId) ?? {},
      breakPoint: classifyRtbBreakPoint({
        endpointRtb: Number(endpointFindingCounts.rtb_cookie_sync_observed ?? 0) > 0,
        explicitSyncRows,
        rtbValidationFinding,
        runtimeAdtechDomainCount
      })
    };
  });

  const breakPointCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.breakPoint] = (counts[row.breakPoint] ?? 0) + 1;
    return counts;
  }, {});

  return {
    audit: "rtb-cookie-sync",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      scanCount: scanIds.length,
      tables: ["scan_runtime_artifacts", "scan_snapshots", "scan_events", "validation_runs", "validation_run_findings"]
    },
    breakPointCounts,
    rows
  };
}

async function runVendorRegistryReconciliationAudit(input: AuditInput) {
  const [registryResult, patternResult, observedResult] = await Promise.all([
    query<VendorRegistryAuditRow>(
      `select canonical_name, vendor_category, aliases, cookie_names, confidence, source
         from vendor_registry
        order by canonical_name`,
      [],
      { readOnly: true }
    ),
    query<VendorDomainPatternAuditRow>(
      `select vendor_registry_id, domain, match_type, confidence, source
         from vendor_domain_patterns
        order by domain`,
      [],
      { readOnly: true }
    ),
    query<ObservedVendorAuditRow>(
      `select vendor_name,
              count(*)::int as observed_count,
              count(distinct scan_id)::int as scan_count,
              count(distinct vendor_category)::int as category_count,
              array_agg(distinct vendor_category order by vendor_category) as categories,
              array_agg(distinct detection_source order by detection_source) as detection_sources,
              array_agg(distinct script_host order by script_host) filter (where script_host is not null) as script_hosts,
              min(created_at) as first_seen,
              max(created_at) as last_seen
         from scan_tracker_vendors
        where vendor_name is not null
        group by vendor_name
        order by scan_count desc, observed_count desc, vendor_name`,
      [],
      { readOnly: true }
    )
  ]);
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  return {
    audit: "vendor-registry-reconciliation",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      tables: ["vendor_registry", "vendor_domain_patterns", "scan_tracker_vendors"],
      mutations: false
    },
    registry: registryResult.rows,
    domainPatterns: patternResult.rows,
    observedVendors: observedResult.rows.map((row) => ({
      categoryCount: row.category_count,
      detectionSources: row.detection_sources,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      observedCount: row.observed_count,
      scanCount: row.scan_count,
      scriptHosts: row.script_hosts,
      vendorName: row.vendor_name,
      categories: row.categories
    }))
  };
}

function normalizeAuditHostname(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\.$/, "").toLowerCase();
  return normalized && /^[a-z0-9](?:[a-z0-9-]*\.)+[a-z0-9-]{2,}$/i.test(normalized) ? normalized : null;
}

function getAuditRequestUrls(row: Record<string, unknown>, fallbackHostname: string | null) {
  const values = [
    row.url,
    row.requestUrl,
    row.request_url,
    row.urlSample,
    row.url_sample,
    ...getStringArray(row.urls),
    ...getStringArray(row.requestUrls ?? row.request_urls),
  ];
  const pathSample = getString(row.pathSample ?? row.path_sample);
  if (fallbackHostname && pathSample && pathSample.startsWith("/")) {
    values.push(`https://${fallbackHostname}${pathSample}`);
  }
  return [...new Set(values
    .map((value) => getString(value))
    .filter((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value))
  )].slice(0, 10);
}

function getAuditRequestSource(row: Record<string, unknown>): "request" | "response" | "script" {
  const hint = [row.type, row.resourceType, row.resource_type, row.initiatorType, row.initiator_type]
    .map((value) => getString(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value))
    .join(" ");
  if (/script/.test(hint)) {
    return "script";
  }
  if (/response/.test(hint)) {
    return "response";
  }
  return "request";
}

function isAuditThirdPartyRequest(row: Record<string, unknown>, hostname: string, thirdPartyHosts: Set<string>) {
  return row.thirdParty === true || row.third_party === true || thirdPartyHosts.has(hostname);
}

type UnknownVendorAuditCandidateInput = {
  domainId?: string;
  hostname: string;
  scanId: string;
  source: "request" | "response" | "script";
  url: string;
};

function redactAuditCandidatePathSegment(segment: string) {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Keep the original encoded segment and redact it below.
  }
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded) ||
    /^[a-f0-9]{16,}$/i.test(decoded) ||
    /^\d{3,}$/.test(decoded) ||
    decoded.includes("@") ||
    decoded.length > 32
  ) {
    return ":id";
  }
  return decoded.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 32) || ":value";
}

function auditCandidatePathTemplate(url: string, hostname: string) {
  try {
    const parsed = new URL(url);
    if (normalizeAuditHostname(parsed.hostname) !== hostname) {
      return null;
    }
    const segments = parsed.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 6)
      .map(redactAuditCandidatePathSegment);
    return segments.length > 0 ? `/${segments.join("/")}` : "/";
  } catch {
    return null;
  }
}

function buildUnknownVendorAuditQueue(inputs: UnknownVendorAuditCandidateInput[]) {
  const excluded = { invalidOrFirstParty: 0, knownCanonical: 0, missingConcretePath: 0 };
  const grouped = new Map<string, {
    hostname: string;
    observationCount: number;
    paths: Set<string>;
    scanIds: Set<string>;
    siteIds: Set<string>;
    sourceTypes: Set<"request" | "response" | "script">;
  }>();

  for (const input of inputs) {
    const hostname = normalizeAuditHostname(input.hostname);
    const pathTemplate = hostname ? auditCandidatePathTemplate(input.url, hostname) : null;
    if (!hostname) {
      excluded.invalidOrFirstParty += 1;
      continue;
    }
    if (!pathTemplate) {
      excluded.missingConcretePath += 1;
      continue;
    }
    if (resolveVendorObservations([{ type: input.source, hostname, url: input.url }]).length > 0) {
      excluded.knownCanonical += 1;
      continue;
    }
    const candidate = grouped.get(hostname) ?? {
      hostname,
      observationCount: 0,
      paths: new Set<string>(),
      scanIds: new Set<string>(),
      siteIds: new Set<string>(),
      sourceTypes: new Set<"request" | "response" | "script">(),
    };
    candidate.observationCount += 1;
    candidate.paths.add(pathTemplate);
    candidate.scanIds.add(input.scanId);
    if (input.domainId) {
      candidate.siteIds.add(input.domainId);
    }
    candidate.sourceTypes.add(input.source);
    grouped.set(hostname, candidate);
  }

  return {
    inputObservationCount: inputs.length,
    excluded,
    candidates: [...grouped.values()]
      .map((candidate) => {
        const distinctPathCount = candidate.paths.size;
        const distinctScanCount = candidate.scanIds.size;
        const distinctSiteCount = candidate.siteIds.size;
        const priorityScore = distinctSiteCount * 5 + distinctScanCount * 2 + Math.min(candidate.observationCount, 50) + Math.min(distinctPathCount, 10);
        return {
          candidateKey: `unknown-endpoint:${candidate.hostname}`,
          hostname: candidate.hostname,
          observationCount: candidate.observationCount,
          distinctScanCount,
          distinctSiteCount,
          distinctPathCount,
          pathTemplates: [...candidate.paths].sort().slice(0, 8),
          sampleEndpoints: [...candidate.paths].sort().slice(0, 5).map((pathTemplate) => `https://${candidate.hostname}${pathTemplate}`),
          sourceTypes: [...candidate.sourceTypes].sort(),
          priorityScore,
          recommendedAction: distinctSiteCount >= 3 && distinctScanCount >= 3 && distinctPathCount >= 1
            ? "deterministic_review"
            : "observe_more",
          requiresOwnerResearch: true,
        };
      })
      .sort((left, right) => right.priorityScore - left.priorityScore || right.distinctSiteCount - left.distinctSiteCount || left.hostname.localeCompare(right.hostname)),
  };
}

async function runUnknownVendorPrevalenceAudit(input: AuditInput) {
  const scanLimit = input.scanLimit ?? 1200;
  const candidateLimit = input.candidateLimit ?? 100;
  const result = await query<UnknownVendorRuntimeAuditRow>(
    `select s.id::text as scan_id,
            s.domain_id::text as domain_id,
            s.completed_at::text as completed_at,
            ra.third_party_request_domains,
            ra.hybrid_runtime_evidence
       from scans s
       join scan_runtime_artifacts ra on ra.scan_id = s.id
      where s.status = 'completed'
        and s.completed_at is not null
      order by s.completed_at desc
      limit $1`,
    [scanLimit],
    { readOnly: true },
  );
  await queryOne<{ ok: number }>("select 1 as ok", [], { readOnly: true });

  const candidateInputs: UnknownVendorAuditCandidateInput[] = [];
  const observedHostsByScan = new Map<string, Set<string>>();
  let requestObservationCount = 0;
  let thirdPartyRequestObservationCount = 0;
  let hostOnlyThirdPartyDomainCount = 0;

  for (const runtime of result.rows) {
    const hybrid = getObject(runtime.hybrid_runtime_evidence);
    const rows = [
      ...getObjectArray(hybrid.requestObservations),
      ...getObjectArray(hybrid.request_observations),
      ...getObjectArray(hybrid.preconsentState0RequestObservations),
      ...getObjectArray(hybrid.preconsent_state0_request_observations),
    ];
    const thirdPartyHosts = new Set(
      getStringArray(runtime.third_party_request_domains)
        .map((value) => normalizeAuditHostname(value))
        .filter((value): value is string => Boolean(value)),
    );
    const seenUrls = new Set<string>();
    for (const row of rows) {
      requestObservationCount += 1;
      const fallbackHostname = normalizeAuditHostname(
        getString(row.hostname) ?? getString(row.host) ?? getString(row.domain) ?? getString(row.requestHost ?? row.request_host),
      );
      const urls = getAuditRequestUrls(row, fallbackHostname);
      for (const url of urls) {
        const hostname = normalizeAuditHostname(getUrlHost(url));
        if (!hostname || !isAuditThirdPartyRequest(row, hostname, thirdPartyHosts)) {
          continue;
        }
        const dedupeKey = `${runtime.scan_id}|${url}`;
        if (seenUrls.has(dedupeKey)) {
          continue;
        }
        seenUrls.add(dedupeKey);
        thirdPartyRequestObservationCount += 1;
        const observedHosts = observedHostsByScan.get(runtime.scan_id) ?? new Set<string>();
        observedHosts.add(hostname);
        observedHostsByScan.set(runtime.scan_id, observedHosts);
        candidateInputs.push({
          scanId: runtime.scan_id,
          domainId: runtime.domain_id ?? undefined,
          hostname,
          source: getAuditRequestSource(row),
          url,
        });
      }
    }
    const observedHosts = observedHostsByScan.get(runtime.scan_id) ?? new Set<string>();
    hostOnlyThirdPartyDomainCount += [...thirdPartyHosts].filter((hostname) => !observedHosts.has(hostname)).length;
  }

  const queue = buildUnknownVendorAuditQueue(candidateInputs);
  return {
    audit: "unknown-vendor-prevalence",
    generatedAt: new Date().toISOString(),
    notes: input.notes ?? null,
    readScope: {
      scanLimit,
      scansRead: result.rows.length,
      tables: ["scans", "scan_runtime_artifacts"],
      mutations: false,
    },
    methodology: {
      canonicalResolverVersion: CANONICAL_VENDOR_RESOLVER_VERSION,
      candidateRules: [
        "third-party request or script observations only",
        "known canonical endpoints excluded before ranking",
        "exact-host clusters only; no parent-domain inference",
        "URL queries, fragments, and dynamic path values are not emitted",
        "candidates are discovery leads and cannot update the registry automatically",
      ],
    },
    inputSummary: {
      requestObservationCount,
      thirdPartyRequestObservationCount,
      hostOnlyThirdPartyDomainCount,
      candidateInputCount: queue.inputObservationCount,
      excluded: queue.excluded,
    },
    candidates: queue.candidates.slice(0, candidateLimit),
  };
}

async function main() {
  const auditName = process.env.OPS_PROD_DB_AUDIT_NAME?.trim();
  if (!auditName) {
    throw new Error("OPS_PROD_DB_AUDIT_NAME is required.");
  }
  if (!process.env.DATABASE_URL?.trim() && !process.env.DATABASE_READ_URL?.trim()) {
    throw new Error("DATABASE_READ_URL or DATABASE_URL is required.");
  }
  const input = decodeInput();
  const result =
    auditName === "rtb-cookie-sync"
      ? await runRtbCookieSyncAudit(input)
      : auditName === "prior-scan-acceleration" || auditName === "scan-acceleration"
        ? await runPriorScanAccelerationAudit(input)
      : auditName === "prior-scan-candidates"
        ? await runPriorScanCandidatesAudit(input)
      : auditName === "signal-finding-continuity"
        ? await runSignalFindingContinuityAudit(input)
      : auditName === "unified-projection-continuity"
        ? await runUnifiedProjectionContinuityAudit(input)
      : auditName === "preconsent-timing-evidence"
        ? await runPreconsentTimingEvidenceAudit(input)
      : auditName === "preconsent-anchor-classification"
        ? await runPreconsentAnchorClassificationAudit(input)
      : auditName === "scan-timing"
        ? await runScanTimingAudit(input)
      : auditName === "scanner-phase-timing"
        ? await runScannerPhaseTimingAudit(input)
      : auditName === "vendor-registry-reconciliation"
        ? await runVendorRegistryReconciliationAudit(input)
        : auditName === "unknown-vendor-prevalence"
          ? await runUnknownVendorPrevalenceAudit(input)
        : null;
  if (!result) {
    throw new Error(`Unsupported prod DB audit: ${auditName}`);
  }
  console.log("__PROD_DB_AUDIT_JSON_START__");
  console.log(JSON.stringify(result, null, 2));
  console.log("__PROD_DB_AUDIT_JSON_END__");
}

void main().catch((error) => {
  console.error(`Prod DB audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
