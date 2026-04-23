"use server";

import { query } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import {
  LEGACY_CHANGE_EVENT_TYPES,
  isMissingComplianceChangeEventsTable,
  type LegacyScanEventRow
} from "../changes/legacy-change-events";

export type HistoryScanRow = {
  completed_at: string | null;
  created_at: string;
  id: string;
  pages_requested: number;
  pages_scanned: number;
  scan_type: string;
  started_at: string | null;
  status: string;
};

export type HistorySnapshotRow = {
  access_posture_class: string | null;
  auth_wall_detected: boolean | null;
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status: string | null;
  legal_coverage_score?: number | null;
  normalized_body_hash: string | null;
  report_finding_count: number | null;
  robots_allowed: boolean | null;
  robots_fetch_http_status: number | null;
  robots_fetch_status: string | null;
  scan_id: string;
  scan_outcome: string | null;
  stop_reason_code: string | null;
  stop_reason_detail: string | null;
  stop_reason_http_status: number | null;
  stop_reason_label: string | null;
  total_signals: number;
  verified_public_surfaces_count?: number | null;
};

export type HistoryChangeSummaryRow = {
  event_type: string;
  scan_id_current: string;
};

export type HistoryDiagnosticEventRow = {
  created_at: string;
  event_type: string;
  message: string;
  metadata_json: Record<string, unknown> | null;
  scan_id: string;
};

export type HistoryPolicyEnrichmentRow = Record<string, unknown> & {
  scan_id?: string;
};

export type HistoryValidationRunSummaryRow = {
  created_at: string;
  finding_count: number;
  id: string;
  scan_id: string;
};

export type HistoryValidationFindingSummaryRow = {
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
  validation_run_id: string;
  validation_verdicts:
    | {
        agreement_score: number | null;
        confidence: number | null;
        created_at: string | null;
        evidence_json: Record<string, unknown> | null;
        model: string | null;
        prompt_version: string | null;
        rationale: string | null;
        system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
        system_confidence_explanation: string | null;
        system_confidence_score: number | null;
        verdict: "supported" | "inconclusive" | "not_supported" | null;
      }
    | Array<{
        agreement_score: number | null;
        confidence: number | null;
        created_at: string | null;
        evidence_json: Record<string, unknown> | null;
        model: string | null;
        prompt_version: string | null;
        rationale: string | null;
        system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
        system_confidence_explanation: string | null;
        system_confidence_score: number | null;
        verdict: "supported" | "inconclusive" | "not_supported" | null;
      }>
    | null;
};

export type HistoryValidationVerdictRow = {
  agreement_score: number | null;
  confidence: number | null;
  created_at: string | null;
  evidence_json: Record<string, unknown> | null;
  model: string | null;
  prompt_version: string | null;
  rationale: string | null;
  system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
  system_confidence_explanation: string | null;
  system_confidence_score: number | null;
  validation_run_finding_id: string;
  verdict: "supported" | "inconclusive" | "not_supported" | null;
};

type QueryErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
} | null;

const CHANGE_EVENT_BATCH_SIZE = 50;

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown database error.";
}

export async function loadHistoryScanRows(input: {
  domainId: string;
  organizationId: string;
}): Promise<HistoryScanRow[]> {
  try {
    const result = await query<HistoryScanRow>(
      `select id, scan_type, status, created_at, started_at, completed_at, pages_requested, pages_scanned
         from scans
        where organization_id = $1
          and domain_id = $2
        order by created_at desc`,
      [input.organizationId, input.domainId],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    throw new Error(`Failed to load domain scan history: ${getErrorMessage(error)}`);
  }
}

export async function loadHistorySnapshots(scanIds: string[]): Promise<HistorySnapshotRow[]> {
  if (!scanIds.length) {
    return [];
  }

  try {
    const result = await query<HistorySnapshotRow>(
      `select *
         from scan_snapshots
        where scan_id = any($1::uuid[])`,
      [scanIds],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    throw new Error(`Failed to load domain scan history: ${getErrorMessage(error)}`);
  }
}

export async function loadHistoryChangeEvents(input: {
  domainId: string;
  organizationId: string;
  scanIds: string[];
}): Promise<{
  data: HistoryChangeSummaryRow[];
  error: QueryErrorLike;
}> {
  const rows: HistoryChangeSummaryRow[] = [];
  let queryError: QueryErrorLike = null;

  for (const scanIdBatch of chunkValues(input.scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    try {
      const result = await query<HistoryChangeSummaryRow>(
        `select scan_id_current, event_type
           from compliance_change_events
          where organization_id = $1
            and domain_id = $2
            and scan_id_current = any($3::uuid[])`,
        [input.organizationId, input.domainId, scanIdBatch],
        { readOnly: true }
      );

      rows.push(...result.rows);
    } catch (error) {
      queryError = { message: getErrorMessage(error) };
      break;
    }
  }

  return { data: rows, error: queryError };
}

export async function loadHistoryDiagnosticEvents(scanIds: string[]): Promise<HistoryDiagnosticEventRow[]> {
  const diagnosticEvents: HistoryDiagnosticEventRow[] = [];

  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    try {
      const result = await query<HistoryDiagnosticEventRow>(
        `select scan_id, event_type, message, metadata_json, created_at
           from scan_events
          where scan_id = any($1::uuid[])
          order by created_at asc`,
        [scanIdBatch],
        { readOnly: true }
      );

      diagnosticEvents.push(...result.rows);
    } catch (error) {
      throw new Error(`Failed to load domain scan history: ${getErrorMessage(error)}`);
    }
  }

  return diagnosticEvents;
}

export async function loadHistoryValidationRuns(scanIds: string[]): Promise<HistoryValidationRunSummaryRow[]> {
  const rows: HistoryValidationRunSummaryRow[] = [];

  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    try {
      const result = await query<HistoryValidationRunSummaryRow>(
        `select id, scan_id, finding_count, created_at
           from validation_runs
          where scan_id = any($1::uuid[])
          order by created_at desc`,
        [scanIdBatch],
        { readOnly: true }
      );

      rows.push(...result.rows);
    } catch (error) {
      throw new Error(`Failed to load domain scan history: ${getErrorMessage(error)}`);
    }
  }

  return rows;
}

export async function loadHistoryPolicyEnrichments(scanIds: string[]): Promise<HistoryPolicyEnrichmentRow[]> {
  const rows: HistoryPolicyEnrichmentRow[] = [];

  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    try {
      const result = await query<HistoryPolicyEnrichmentRow>(
        `select *
           from policy_enrichment
          where scan_id = any($1::uuid[])
          order by created_at asc`,
        [scanIdBatch],
        { readOnly: true }
      );

      rows.push(...result.rows);
    } catch (error) {
      throw new Error(`Failed to load domain scan history: ${getErrorMessage(error)}`);
    }
  }

  return rows;
}

export async function loadHistoryValidationFindings(
  validationRunIds: string[]
): Promise<HistoryValidationFindingSummaryRow[]> {
  if (!validationRunIds.length) {
    return [];
  }

  const rows: HistoryValidationFindingSummaryRow[] = [];

  for (const validationRunIdBatch of chunkValues(validationRunIds, CHANGE_EVENT_BATCH_SIZE)) {
    try {
      const result = await query<HistoryValidationFindingSummaryRow>(
        `select id, validation_run_id, category, subtype, finding_family, finding_source, finding_scope,
                finding_subject, rule_key, title, description, severity, page_url, evidence_json
           from validation_run_findings
          where validation_run_id = any($1::uuid[])`,
        [validationRunIdBatch],
        { readOnly: true }
      );

      rows.push(...result.rows);
    } catch (error) {
      throw new Error(`Failed to load domain scan history: ${getErrorMessage(error)}`);
    }
  }

  return rows;
}

export async function loadHistoryValidationVerdicts(
  validationFindingIds: string[]
): Promise<Map<string, HistoryValidationVerdictRow>> {
  const verdictByFindingId = new Map<string, HistoryValidationVerdictRow>();

  if (!validationFindingIds.length) {
    return verdictByFindingId;
  }

  for (const findingIdBatch of chunkValues(validationFindingIds, CHANGE_EVENT_BATCH_SIZE)) {
    try {
      const result = await query<HistoryValidationVerdictRow>(
        `select validation_run_finding_id, verdict, confidence, rationale, agreement_score, model,
                prompt_version, evidence_json, created_at, system_confidence_score,
                system_confidence_band, system_confidence_explanation
           from validation_verdicts
          where validation_run_finding_id = any($1::uuid[])
          order by created_at desc`,
        [findingIdBatch],
        { readOnly: true }
      );

      for (const row of result.rows) {
        if (!verdictByFindingId.has(row.validation_run_finding_id)) {
          verdictByFindingId.set(row.validation_run_finding_id, row);
        }
      }
    } catch (error) {
      throw new Error(`Failed to load domain scan history verdicts: ${getErrorMessage(error)}`);
    }
  }

  return verdictByFindingId;
}

export async function loadHistoryLegacyChangeEvents(input: {
  domainId: string;
  organizationId: string;
  scanIds: string[];
}): Promise<LegacyScanEventRow[]> {
  const legacyEvents: LegacyScanEventRow[] = [];
  let legacyEventsError: QueryErrorLike = null;

  for (const scanIdBatch of chunkValues(input.scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    try {
      const result = await query<LegacyScanEventRow>(
        `select id, scan_id, event_type, message, metadata_json, created_at
           from scan_events
          where organization_id = $1
            and domain_id = $2
            and scan_id = any($3::uuid[])
            and event_type = any($4::text[])
          order by created_at desc`,
        [input.organizationId, input.domainId, scanIdBatch, [...LEGACY_CHANGE_EVENT_TYPES, SCAN_EVENT_TYPES.changesComputed]],
        { readOnly: true }
      );

      legacyEvents.push(...result.rows);
    } catch (error) {
      legacyEventsError = { message: getErrorMessage(error) };
      break;
    }
  }

  if (legacyEventsError) {
    throw new Error(`Failed to load domain scan history: ${legacyEventsError.message}`);
  }

  return legacyEvents;
}

export { isMissingComplianceChangeEventsTable };
