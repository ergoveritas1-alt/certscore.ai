import "server-only";

import { createHash } from "node:crypto";
import { consentControlAssessmentSchema, type ConsentControlAssessment } from "@certscore/contracts";
import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { ScanDetailResponse } from "./get-scan-by-id";
import {
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  shouldUseLocalV2DagScanTool
} from "./local-v2-dag-scan-config";
import { lookupTrancoRankMetadata, trancoRankFromScanConfig } from "./tranco-rank-metadata";
import { debugBuildScanReportUnifiedFindingStateForScan } from "../../lib/scans/scan-report-unified-findings";
import { deriveCanonicalOverallScoreForReport } from "./canonical-overall-score";
import { deriveSharedScanDetailGdprEprivacyCoverageChecklist } from "./scan-detail-checklist";
import { buildRuntimeCookieInventory } from "../../lib/scans/runtime-cookie-evidence";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import {
  buildPersistedFirstLayerConsentEvidence,
  projectFirstLayerConsentChoices
} from "./scan-report-consent-projection";
import {
  buildPersistedScanReportProjection,
  completionToReportProjectionMs,
  isCurrentScanReportProjectionReady,
  readPersistedScanReportProjection,
  REPORT_PROJECTION_READY_WARNING_MS,
  SCAN_REPORT_PROJECTION_VERSION
} from "./scan-report-projection-contract";
import { getScanReportProjectionGeneration } from "./scan-report-projection-generation";

/**
 * The scan detail record already includes the scan_snapshots row. Once that
 * row has been written by the completion/backfill path, it is the stable
 * display read model and the detail page must not rebuild the v2 bundle just
 * to rediscover values that are already persisted there.
 */
export function hasReadyScanReportProjection(scanRecord: Pick<ScanDetailResponse, "scan" | "snapshot">) {
  return Boolean(
    scanRecord.scan.status === "completed" &&
    isCurrentScanReportProjectionReady(scanRecord.snapshot)
  );
}

export function getPersistedScanReportProjection(
  scanRecord: Pick<ScanDetailResponse, "scan" | "snapshot">
) {
  return readPersistedScanReportProjection(scanRecord);
}

type PersistedScanReportProjectionRow = {
  report_projection_computed_at: string | null;
  report_projection_payload: Record<string, unknown> | null;
  report_projection_payload_sha256: string | null;
  report_projection_payload_size_bytes: number | null;
  report_projection_status: string | null;
  report_projection_version: string | null;
  scan_id: string;
  scan_status: string;
};

/**
 * Reads the local display projection without first loading and normalizing all
 * scan evidence tables. Callers must establish viewer access before using the
 * unrestricted platform-admin/public scope.
 */
export async function loadPersistedScanReportProjection(input: {
  organizationId?: string | null;
  scanId: string;
}) {
  const row = await queryOne<PersistedScanReportProjectionRow>(
    `select s.id as scan_id,
            s.status as scan_status,
            projection.report_projection_computed_at,
            projection.report_projection_payload,
            projection.report_projection_payload_sha256,
            projection.report_projection_payload_size_bytes,
            projection.report_projection_status,
            projection.report_projection_version
       from public.scans s
       join public.scan_snapshots projection on projection.scan_id = s.id
      where s.id = $1::uuid
        and ($2::uuid is null or s.organization_id = $2::uuid)
      limit 1`,
    [input.scanId, input.organizationId ?? null],
    { readOnly: true }
  );
  if (!row) {
    return null;
  }
  return readPersistedScanReportProjection({
    scan: {
      id: row.scan_id,
      status: row.scan_status
    } as ScanDetailResponse["scan"],
    snapshot: row
  });
}

export type ScanReportProjectionRow = {
  access_posture_class: string | null;
  admin_industry_label: string | null;
  certscore_overall: number | null;
  cmp_vendor_name: string | null;
  consent_accept_observed: boolean | null;
  consent_assessment_computed_at: string | null;
  consent_assessment_source_hash: string | null;
  consent_assessment_status: string | null;
  consent_assessment_version: string | null;
  consent_control_assessment: Record<string, unknown> | null;
  consent_coverage_status: string | null;
  consent_evidence_status: string | null;
  consent_control_evidence: Record<string, unknown> | null;
  consent_options_observed: boolean | null;
  consent_reject_observed: boolean | null;
  consent_surface_status: string | null;
  duration_ms: number | null;
  egress_id: string | null;
  egress_type: string | null;
  highest_successful_tier: string | null;
  privacy_policy_present: boolean | null;
  report_finding_count: number | null;
  report_projection_computed_at: string | null;
  report_projection_error: string | null;
  report_projection_source_hash: string | null;
  report_projection_status: "pending" | "ready" | "failed" | string;
  report_projection_version: string | null;
  scan_id: string;
  scan_no_go_assessment: Record<string, unknown> | null;
  scan_outcome: string | null;
  scan_timestamp: string | null;
  stop_reason_code: string | null;
  stop_reason_detail: string | null;
  stop_reason_label: string | null;
  score_coverage_confidence: string | null;
  score_coverage_ratio: number | null;
  score_scored_at: string | null;
  score_source: string | null;
  score_version: string | null;
  site_language_primary: string | null;
  stop_tier: string | null;
  top_finding_count: number | null;
  total_signals: number | null;
  tranco_list_id: string | null;
  tranco_rank: number | null;
  tranco_snapshot_date: string | null;
  visual_access_review: Record<string, unknown> | null;
};

type ProjectionValue = {
  score: number | null;
  topFindingCount: number | null;
  findingCount: number | null;
  cmpVendorName: string | null;
  privacyPolicyPresent: boolean | null;
  consentAcceptObserved: boolean | null;
  consentRejectObserved: boolean | null;
  consentOptionsObserved: boolean | null;
  consentEvidenceStatus: "observed" | "not_observed" | "unknown";
  industry: string | null;
  primaryLanguage: string | null;
  scanOutcome: string | null;
  stopReasonCode: string | null;
  stopReasonDetail: string | null;
  stopReasonLabel: string | null;
  trancoRank: number | null;
  trancoListId: string | null;
  trancoSnapshotDate: string | null;
  egressId: string | null;
  egressProvider: string | null;
  durationMs: number | null;
  scoreSource: string | null;
  scoreVersion: string | null;
  scoreScoredAt: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function rawFirstLayerConsentChoices(scanRecord: ScanDetailResponse) {
  const runtimeArtifacts = record(scanRecord.runtimeArtifacts);
  const materializedRecord = scanRecord as unknown as Record<string, unknown>;
  const hybrid = record(materializedRecord.hybridRuntimeEvidence) ?? record(materializedRecord.hybrid_runtime_evidence);
  return [
    record(hybrid?.firstLayerConsentChoices),
    record(hybrid?.first_layer_consent_choices),
    record(record(runtimeArtifacts?.hybridRuntimeEvidence)?.firstLayerConsentChoices),
    record(record(runtimeArtifacts?.hybrid_runtime_evidence)?.first_layer_consent_choices),
    record(runtimeArtifacts?.firstLayerConsentChoices),
    record(runtimeArtifacts?.first_layer_consent_choices)
  ].find((value): value is Record<string, unknown> => Boolean(value));
}

function firstLayerConsentChoices(scanRecord: ScanDetailResponse) {
  return projectFirstLayerConsentChoices(rawFirstLayerConsentChoices(scanRecord) ?? null);
}

function canonicalConsentAssessment(scanRecord: ScanDetailResponse): ConsentControlAssessment | null {
  const runtimeArtifacts = record(scanRecord.runtimeArtifacts);
  const hybrid = record(runtimeArtifacts?.hybridRuntimeEvidence) ?? record(runtimeArtifacts?.hybrid_runtime_evidence);
  const candidates = [
    runtimeArtifacts?.consentControlAssessment,
    runtimeArtifacts?.consent_control_assessment,
    hybrid?.consentControlAssessment,
    hybrid?.consent_control_assessment,
    // The snapshot is a persisted projection and may contain an older valid
    // assessment while a fresh typed runtime artifact is being materialized.
    record(scanRecord.snapshot)?.consent_control_assessment,
  ];
  for (const candidate of candidates) {
    const parsed = consentControlAssessmentSchema.safeParse(candidate);
    if (parsed.success && parsed.data.scan.scanId === scanRecord.scan.id) return parsed.data;
  }
  return null;
}

function assertCanonicalConsentProjectionInput(
  scanRecord: ScanDetailResponse,
  assessment: ConsentControlAssessment | null
) {
  const scanConfig = record(scanRecord.scan.scanConfigJson);
  if (
    scanRecord.scan.status !== "completed" ||
    scanConfig?.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR
  ) {
    return;
  }

  if (!assessment) {
    throw new Error(
      `Refusing to mark scan ${scanRecord.scan.id} report projection ready before ConsentControlAssessment v2 is materialized.`
    );
  }
}

type ScanReportProjectionSource = {
  snapshot?: unknown;
  runtimeArtifacts?: unknown;
};

export class ScanReportProjectionNotReadyError extends Error {
  constructor(scanId: string, reason: string) {
    super(`Scan ${scanId} canonical report projection is not ready: ${reason}.`);
    this.name = "ScanReportProjectionNotReadyError";
  }
}

export class StaleScanReportProjectionSourceError extends Error {
  constructor(scanId: string) {
    super(`Refusing to publish stale report projection source for scan ${scanId}.`);
    this.name = "StaleScanReportProjectionSourceError";
  }
}

function assertCanonicalReportProjectionReady(scanRecord: ScanDetailResponse) {
  const scanConfig = record(scanRecord.scan.scanConfigJson);
  if (scanConfig?.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR) return;
  if (!scanRecord.signalEnrichmentWorkflow.mergedSignalsReady) {
    throw new ScanReportProjectionNotReadyError(scanRecord.scan.id, "signal merge is incomplete");
  }
  if (!scanRecord.signalEnrichmentWorkflow.findingsReady) {
    throw new ScanReportProjectionNotReadyError(scanRecord.scan.id, "unified findings are incomplete");
  }
}

function sourceHash(scanRecord: ScanDetailResponse, value: ProjectionValue, source: ScanReportProjectionSource = {}) {
  const snapshot = record(scanRecord.snapshot);
  const hashableSnapshot = snapshot
    ? Object.fromEntries(
        Object.entries(snapshot).filter(([key]) =>
          !key.startsWith("report_projection_")
        )
      )
    : null;
  return createHash("sha256")
    .update(JSON.stringify({
      scan: scanRecord.scan,
      snapshot: hashableSnapshot,
      runtimeArtifacts: scanRecord.runtimeArtifacts,
      sourceSnapshot: source.snapshot ?? null,
      sourceRuntimeArtifacts: source.runtimeArtifacts ?? null,
      value
    }))
    .digest("hex");
}

export async function loadScanReportProjectionRows(scanIds: string[]) {
  const ids = [...new Set(scanIds.filter((value) => /^[0-9a-f-]{36}$/i.test(value)))];
  if (!ids.length) {
    return new Map<string, ScanReportProjectionRow>();
  }

  const result = await query<ScanReportProjectionRow>(
    `select scan_id,
            access_posture_class,
            admin_industry_label,
            certscore_overall,
            cmp_vendor_name,
            consent_accept_observed,
            consent_assessment_computed_at,
            consent_assessment_source_hash,
            consent_assessment_status,
            consent_assessment_version,
            consent_control_assessment,
            consent_control_evidence,
            consent_coverage_status,
            consent_evidence_status,
            consent_options_observed,
            consent_reject_observed,
            consent_surface_status,
            duration_ms,
            egress_id,
            egress_type,
            highest_successful_tier,
            privacy_policy_present,
            report_finding_count,
            report_projection_computed_at,
            report_projection_error,
            report_projection_source_hash,
            report_projection_status,
            report_projection_version,
            scan_no_go_assessment,
            scan_outcome,
            scan_timestamp,
            stop_reason_code,
            stop_reason_detail,
            stop_reason_label,
            score_coverage_confidence,
            score_coverage_ratio,
            score_scored_at,
            score_source,
            score_version,
            site_language_primary,
            stop_tier,
            top_finding_count,
            total_signals,
            tranco_list_id,
            tranco_rank,
            tranco_snapshot_date,
            visual_access_review
       from public.scan_snapshots
      where scan_id = any($1::uuid[])`,
    [ids],
    { readOnly: true }
  );

  return new Map(result.rows.map((row) => [row.scan_id, row] as const));
}

export async function deriveScanReportProjectionValue(
  scanRecord: ScanDetailResponse,
  source: ScanReportProjectionSource = {}
): Promise<ProjectionValue> {
  const snapshot = record(scanRecord.snapshot);
  const sourceSnapshot = record(source.snapshot) ?? snapshot;
  const runtimeArtifacts = record(scanRecord.runtimeArtifacts);
  const reportState = debugBuildScanReportUnifiedFindingStateForScan(scanRecord as unknown as Record<string, unknown>);
  const executiveFindingsProjection = projectExecutiveFindingsFromUnifiedPackets(
    reportState.globalUnifiedFindings
  );
  const runtimeCookieRows = buildRuntimeCookieInventory({
    runtimeArtifacts: scanRecord.runtimeArtifacts
  }).rows;
  const checklist = deriveSharedScanDetailGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    events: scanRecord.events,
    normalizedConcerns: reportState.normalizedConcerns,
    policyEnrichmentCount: scanRecord.policyEnrichment.length,
    projectedFindings: executiveFindingsProjection.findings,
    runtimeArtifacts: scanRecord.runtimeArtifacts,
    runtimeCookieRows,
    scanCompleted: scanRecord.scan.status === "completed",
    snapshot: scanRecord.snapshot,
    unifiedFindings: reportState.globalUnifiedFindings
  });
  const canonicalScore = scanRecord.scan.status === "completed"
    ? deriveCanonicalOverallScoreForReport({
        checklistRows: checklist,
        unifiedFindings: reportState.globalUnifiedFindings
      })
    : null;
  const choices = firstLayerConsentChoices(scanRecord);
  const assessment = canonicalConsentAssessment(scanRecord);
  assertCanonicalConsentProjectionInput(scanRecord, assessment);
  const trancoFromConfig = trancoRankFromScanConfig(scanRecord.scan.scanConfigJson);
  const trancoMetadata = await lookupTrancoRankMetadata({
    hostname: scanRecord.scan.domainHostname,
    normalizedUrl: null
  });
  const industry = stringValue(scanRecord.domainBenchmark?.industry) ?? stringValue(sourceSnapshot?.admin_industry_label) ?? stringValue(snapshot?.admin_industry_label);
  const score = canonicalScore ?? numberValue(snapshot?.certscore_overall);
  const egressId = shouldUseLocalV2DagScanTool() ? null : stringValue(sourceSnapshot?.egress_id) ?? stringValue(snapshot?.egress_id);
  const egressProvider = shouldUseLocalV2DagScanTool() ? null : stringValue(sourceSnapshot?.egress_type) ?? stringValue(snapshot?.egress_type);

  return {
    score,
    topFindingCount: executiveFindingsProjection.topFindings.length,
    findingCount: reportState.globalUnifiedFindings.length || numberValue(snapshot?.report_finding_count),
    cmpVendorName: stringValue(snapshot?.cmp_vendor_name),
    privacyPolicyPresent: booleanValue(sourceSnapshot?.privacy_policy_present) ?? booleanValue(snapshot?.privacy_policy_present),
    consentAcceptObserved: assessment
      ? assessment.controls.accept.state === "observed" ? true : assessment.controls.accept.state === "not_observed" ? false : null
      : choices?.retained ? choices.accept : null,
    consentRejectObserved: assessment
      ? assessment.controls.reject.state === "observed" ? true : assessment.controls.reject.state === "not_observed" ? false : null
      : choices?.retained ? choices.reject : null,
    consentOptionsObserved: assessment
      ? assessment.controls.options.state === "observed" ? true : assessment.controls.options.state === "not_observed" ? false : null
      : choices?.retained ? choices.options : null,
    consentEvidenceStatus: assessment
      ? assessment.surface.status === "observed_actionable" || assessment.surface.status === "observed_non_actionable"
        ? "observed"
        : assessment.surface.status === "not_observed"
          ? "not_observed"
          : "unknown"
      : choices?.retained ? "observed" : "unknown",
    industry,
    primaryLanguage: stringValue(snapshot?.site_language_primary),
    scanOutcome: stringValue(sourceSnapshot?.scan_outcome),
    stopReasonCode: stringValue(sourceSnapshot?.stop_reason_code),
    stopReasonDetail: stringValue(sourceSnapshot?.stop_reason_detail),
    stopReasonLabel: stringValue(sourceSnapshot?.stop_reason_label),
    trancoRank: trancoFromConfig ?? trancoMetadata?.rank ?? null,
    trancoListId: trancoMetadata?.sourceListId ?? null,
    trancoSnapshotDate: trancoMetadata?.sourceUpdatedAt?.slice(0, 10) ?? null,
    egressId,
    egressProvider,
    durationMs: numberValue(scanRecord.scan.durationMs),
    scoreSource: canonicalScore === null ? (score === null ? null : "legacy.scan_snapshot") : "canonical.gdpr_eprivacy",
    scoreVersion: canonicalScore === null ? null : "gdpr-eprivacy-canonical-shadow-v7",
    scoreScoredAt: scanRecord.scan.completedAt
  };
}

export async function persistScanReportProjection(
  scanRecord: ScanDetailResponse,
  source: ScanReportProjectionSource = {}
) {
  assertCanonicalReportProjectionReady(scanRecord);
  const value = await deriveScanReportProjectionValue(scanRecord, source);
  const snapshot = record(scanRecord.snapshot);
  const sourceSnapshot = record(source.snapshot) ?? snapshot;
  const sourceRuntimeArtifacts = record(source.runtimeArtifacts) ?? record(scanRecord.runtimeArtifacts);
  const assessment = canonicalConsentAssessment(scanRecord);
  assertCanonicalConsentProjectionInput(scanRecord, assessment);
  const consentControlEvidence = buildPersistedFirstLayerConsentEvidence(
    rawFirstLayerConsentChoices(scanRecord) ?? null
  );
  const projectionWasAlreadyReady = isCurrentScanReportProjectionReady(snapshot);
  const scanNoGoAssessment = record(sourceRuntimeArtifacts?.scan_no_go_assessment) ?? record(sourceRuntimeArtifacts?.scanNoGoAssessment) ?? record(sourceSnapshot?.scan_no_go_assessment);
  const visualAccessReview = record(sourceRuntimeArtifacts?.visual_access_review) ?? record(sourceRuntimeArtifacts?.visualAccessReview) ?? record(sourceSnapshot?.visual_access_review);
  const hash = sourceHash(scanRecord, value, source);
  const projectedSnapshot = {
    ...(scanRecord.snapshot ?? {}),
    certscore_overall: value.score,
    cmp_vendor_name: value.cmpVendorName,
    consent_accept_observed: value.consentAcceptObserved,
    consent_evidence_status: value.consentEvidenceStatus,
    consent_options_observed: value.consentOptionsObserved,
    consent_reject_observed: value.consentRejectObserved,
    privacy_policy_present: value.privacyPolicyPresent,
    report_finding_count: value.findingCount,
    score_scored_at: value.scoreScoredAt,
    score_source: value.scoreSource,
    score_version: value.scoreVersion,
    top_finding_count: value.topFindingCount
  };
  const persistedProjection = buildPersistedScanReportProjection({
    ...scanRecord,
    snapshot: projectedSnapshot
  });
  const generation = getScanReportProjectionGeneration(scanRecord);

  const persistence = await query(
    `insert into public.scan_snapshots (
       scan_id, organization_id, domain_id, pages_requested, pages_scanned,
       certscore_overall, admin_industry_label, top_finding_count,
       report_finding_count, site_language_primary, scan_outcome,
       stop_reason_code, stop_reason_detail, stop_reason_label,
       privacy_policy_present, cmp_vendor_name, tranco_rank,
       tranco_list_id, tranco_snapshot_date, egress_id, egress_type,
       duration_ms, score_source, score_version, score_scored_at,
       consent_accept_observed, consent_reject_observed, consent_options_observed,
       consent_evidence_status, consent_control_evidence,
       consent_control_assessment, consent_assessment_version,
       consent_assessment_status, consent_assessment_computed_at,
       consent_assessment_source_hash, consent_coverage_status,
       consent_surface_status,
       scan_no_go_assessment, visual_access_review,
       report_projection_version, report_projection_status,
       report_projection_computed_at, report_projection_source_hash,
       report_projection_error, report_projection_payload,
       report_projection_payload_sha256, report_projection_payload_size_bytes
     )
     select s.id, s.organization_id, s.domain_id,
            greatest(coalesce(s.pages_requested, s.pages_scanned, 1), 1),
            coalesce(s.pages_scanned, 0),
            $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15::date, $16, $17, $18, $19, $20, $21::timestamptz,
            $22, $23, $24, $25, $26::jsonb,
            $31::jsonb, $32, $33, $34::timestamptz, $35, $36, $37,
            $27::jsonb, $28::jsonb,
            $29, 'ready', timezone('utc', now()), $30, null,
            $38::jsonb, $39, $40
       from public.scans s
      where s.id = $1::uuid
        and s.domain_id is not null
        and (select count(*) from public.scan_events source_events where source_events.scan_id = s.id) = $41::bigint
        and coalesce((
              select source_events.id::text
                from public.scan_events source_events
               where source_events.scan_id = s.id
               order by source_events.created_at desc, source_events.id desc
               limit 1
            ), '') = coalesce($42::text, '')
     on conflict (scan_id) do update
       set certscore_overall = excluded.certscore_overall,
           admin_industry_label = excluded.admin_industry_label,
           top_finding_count = excluded.top_finding_count,
           report_finding_count = excluded.report_finding_count,
           site_language_primary = coalesce(excluded.site_language_primary, scan_snapshots.site_language_primary),
           scan_outcome = coalesce(scan_snapshots.scan_outcome, excluded.scan_outcome),
           stop_reason_code = coalesce(excluded.stop_reason_code, scan_snapshots.stop_reason_code),
           stop_reason_detail = coalesce(excluded.stop_reason_detail, scan_snapshots.stop_reason_detail),
           stop_reason_label = coalesce(excluded.stop_reason_label, scan_snapshots.stop_reason_label),
           privacy_policy_present = excluded.privacy_policy_present,
           cmp_vendor_name = excluded.cmp_vendor_name,
           tranco_rank = coalesce(excluded.tranco_rank, scan_snapshots.tranco_rank),
           tranco_list_id = coalesce(excluded.tranco_list_id, scan_snapshots.tranco_list_id),
           tranco_snapshot_date = coalesce(excluded.tranco_snapshot_date, scan_snapshots.tranco_snapshot_date),
           egress_id = excluded.egress_id,
           egress_type = excluded.egress_type,
           duration_ms = excluded.duration_ms,
           score_source = excluded.score_source,
           score_version = excluded.score_version,
           score_scored_at = excluded.score_scored_at,
           consent_accept_observed = excluded.consent_accept_observed,
           consent_reject_observed = excluded.consent_reject_observed,
           consent_options_observed = excluded.consent_options_observed,
           consent_evidence_status = excluded.consent_evidence_status,
           consent_control_evidence = excluded.consent_control_evidence,
           consent_control_assessment = excluded.consent_control_assessment,
           consent_assessment_version = excluded.consent_assessment_version,
           consent_assessment_status = excluded.consent_assessment_status,
           consent_assessment_computed_at = excluded.consent_assessment_computed_at,
           consent_assessment_source_hash = excluded.consent_assessment_source_hash,
           consent_coverage_status = excluded.consent_coverage_status,
           consent_surface_status = excluded.consent_surface_status,
           scan_no_go_assessment = coalesce(excluded.scan_no_go_assessment, scan_snapshots.scan_no_go_assessment),
           visual_access_review = coalesce(excluded.visual_access_review, scan_snapshots.visual_access_review),
           report_projection_version = excluded.report_projection_version,
           report_projection_status = excluded.report_projection_status,
           report_projection_computed_at = excluded.report_projection_computed_at,
           report_projection_source_hash = excluded.report_projection_source_hash,
           report_projection_error = excluded.report_projection_error,
           report_projection_payload = excluded.report_projection_payload,
           report_projection_payload_sha256 = excluded.report_projection_payload_sha256,
           report_projection_payload_size_bytes = excluded.report_projection_payload_size_bytes`,
    [
      scanRecord.scan.id,
      value.score,
      value.industry,
      value.topFindingCount,
      value.findingCount,
      value.primaryLanguage,
      value.scanOutcome,
      value.stopReasonCode,
      value.stopReasonDetail,
      value.stopReasonLabel,
      value.privacyPolicyPresent,
      value.cmpVendorName,
      value.trancoRank,
      value.trancoListId,
      value.trancoSnapshotDate,
      value.egressId,
      value.egressProvider,
      value.durationMs,
      value.scoreSource,
      value.scoreVersion,
      value.scoreScoredAt,
      value.consentAcceptObserved,
      value.consentRejectObserved,
      value.consentOptionsObserved,
      value.consentEvidenceStatus,
      consentControlEvidence ? JSON.stringify(consentControlEvidence) : null,
      scanNoGoAssessment ? JSON.stringify(scanNoGoAssessment) : null,
      visualAccessReview ? JSON.stringify(visualAccessReview) : null,
      SCAN_REPORT_PROJECTION_VERSION,
      hash,
      assessment ? JSON.stringify(assessment) : null,
      assessment?.artifactVersion ?? null,
      assessment?.assessmentStatus ?? null,
      assessment?.provenance.computedAt ?? null,
      assessment?.provenance.sourceHash ?? null,
      assessment?.coverage.status ?? null,
      assessment?.surface.status ?? null,
      JSON.stringify(persistedProjection.payload),
      persistedProjection.sha256,
      persistedProjection.sizeBytes,
      generation.eventCount,
      generation.latestEventId
    ]
  );

  if (persistence.rowCount !== 1) {
    throw new StaleScanReportProjectionSourceError(scanRecord.scan.id);
  }

  if (!projectionWasAlreadyReady) {
    const completionToProjectionMs = completionToReportProjectionMs(scanRecord.scan.completedAt);
    const event = {
      completionToProjectionMs,
      event: "scan.report_projection.ready",
      payloadSizeBytes: persistedProjection.sizeBytes,
      projectionVersion: SCAN_REPORT_PROJECTION_VERSION,
      scanId: scanRecord.scan.id
    };
    if (
      completionToProjectionMs !== null &&
      completionToProjectionMs > REPORT_PROJECTION_READY_WARNING_MS
    ) {
      console.warn(JSON.stringify(event));
    } else {
      console.info(JSON.stringify(event));
    }
  }

  return value;
}
