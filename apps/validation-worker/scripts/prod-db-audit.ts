import { query, queryOne } from "@website-signal-risk-scanner/db";
import {
  deriveSignalEnrichmentWorkflowState,
  getPrimaryCategoryDescription,
  getPrimaryCategoryLabel,
  mapSignalKeyToTaxonomy
} from "@website-signal-risk-scanner/shared";
import { buildNanoPolicyInputsFromDocumentSources, shouldPreferNanoDocumentSources } from "../../web/lib/scans/nano-document-sources";
import { buildScanReportUnifiedFindingsForScan } from "../../web/lib/scans/scan-report-unified-findings";
import type { UnifiedFindingDisplayPacket } from "../../web/lib/scans/unified-findings";
import type { ScanValidationFinding } from "../../web/lib/scans/validation-review-linking";
import { repairFindingFamilyPacketEvents } from "../../web/server/scans/family-packet-event-repair";

type AuditInput = {
  candidateLimit?: number;
  sinceDays?: number;
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
      return {
        completedAt: getString(metadata.completedAt ?? detail.completedAt),
        durationMs,
        elapsedMs: getNumber(metadata.elapsedMs) ?? getNumber(detail.elapsedMs) ?? durationMs,
        errorCategory: getString(metadata.errorCategory ?? detail.errorCategory),
        historicalHintResolutionDurationMs: getNumber(metadata.historicalHintResolutionDurationMs ?? detail.historicalHintResolutionDurationMs),
        phase: getString(metadata.phase ?? metadata.stepKey ?? detail.phase ?? detail.stepKey),
        homepageFetchStatus: getString(metadata.homepageFetchStatus ?? detail.homepageFetchStatus),
        homepageSetupSource: getString(metadata.homepageSetupSource ?? detail.homepageSetupSource),
        homepageSetupWaitMs: getNumber(metadata.homepageSetupWaitMs ?? detail.homepageSetupWaitMs),
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
        completedAt: getString(metadata.completedAt),
        durationMs,
        elapsedMs: getNumber(metadata.elapsedMs) ?? durationMs,
        stage: getString(metadata.stage ?? metadata.stepKey),
        status,
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
      if (!key || diagnostic.durationMs === null) {
        continue;
      }
      const existing = diagnosticPhaseDurations.get(key) ?? [];
      existing.push(diagnostic.durationMs);
      diagnosticPhaseDurations.set(key, existing);
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
      : auditName === "prior-scan-acceleration"
        ? await runPriorScanAccelerationAudit(input)
      : auditName === "prior-scan-candidates"
        ? await runPriorScanCandidatesAudit(input)
      : auditName === "signal-finding-continuity"
        ? await runSignalFindingContinuityAudit(input)
      : auditName === "unified-projection-continuity"
        ? await runUnifiedProjectionContinuityAudit(input)
      : auditName === "scan-timing"
        ? await runScanTimingAudit(input)
      : auditName === "scanner-phase-timing"
        ? await runScannerPhaseTimingAudit(input)
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
