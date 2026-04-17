"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
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
  auth_wall_detected: boolean | null;
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status: string | null;
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

export async function loadHistoryScanRows(input: {
  domainId: string;
  organizationId: string;
}): Promise<HistoryScanRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scans")
    .select("id, scan_type, status, created_at, started_at, completed_at, pages_requested, pages_scanned")
    .eq("organization_id", input.organizationId)
    .eq("domain_id", input.domainId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load domain scan history: ${error.message}`);
  }

  return (data ?? []) as HistoryScanRow[];
}

export async function loadHistorySnapshots(scanIds: string[]): Promise<HistorySnapshotRow[]> {
  if (!scanIds.length) {
    return [];
  }

  const db = createDatabaseClient();
  const { data, error } = await db.from("scan_snapshots").select("*").in("scan_id", scanIds);

  if (error) {
    throw new Error(`Failed to load domain scan history: ${error.message}`);
  }

  return (data ?? []) as HistorySnapshotRow[];
}

export async function loadHistoryChangeEvents(input: {
  domainId: string;
  organizationId: string;
  scanIds: string[];
}): Promise<{
  data: HistoryChangeSummaryRow[];
  error: QueryErrorLike;
}> {
  const db = createDatabaseClient();
  const rows: HistoryChangeSummaryRow[] = [];
  let queryError: QueryErrorLike = null;

  for (const scanIdBatch of chunkValues(input.scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data, error } = await db
      .from("compliance_change_events")
      .select("scan_id_current, event_type")
      .eq("organization_id", input.organizationId)
      .eq("domain_id", input.domainId)
      .in("scan_id_current", scanIdBatch);

    if (error) {
      queryError = error;
      break;
    }

    rows.push(...((data ?? []) as HistoryChangeSummaryRow[]));
  }

  return { data: rows, error: queryError };
}

export async function loadHistoryDiagnosticEvents(scanIds: string[]): Promise<HistoryDiagnosticEventRow[]> {
  const db = createDatabaseClient();
  const diagnosticEvents: HistoryDiagnosticEventRow[] = [];

  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data, error } = await db
      .from("scan_events")
      .select("scan_id, event_type, message, metadata_json, created_at")
      .in("scan_id", scanIdBatch)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to load domain scan history: ${error.message}`);
    }

    diagnosticEvents.push(...((data ?? []) as HistoryDiagnosticEventRow[]));
  }

  return diagnosticEvents;
}

export async function loadHistoryValidationRuns(scanIds: string[]): Promise<HistoryValidationRunSummaryRow[]> {
  const db = createDatabaseClient();
  const rows: HistoryValidationRunSummaryRow[] = [];

  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data, error } = await db
      .from("validation_runs")
      .select("id, scan_id, finding_count, created_at")
      .in("scan_id", scanIdBatch)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load domain scan history: ${error.message}`);
    }

    rows.push(...((data ?? []) as HistoryValidationRunSummaryRow[]));
  }

  return rows;
}

export async function loadHistoryPolicyEnrichments(scanIds: string[]): Promise<HistoryPolicyEnrichmentRow[]> {
  const db = createDatabaseClient();
  const rows: HistoryPolicyEnrichmentRow[] = [];

  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data, error } = await db
      .from("policy_enrichment")
      .select("*")
      .in("scan_id", scanIdBatch)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to load domain scan history: ${error.message}`);
    }

    rows.push(...((data ?? []) as HistoryPolicyEnrichmentRow[]));
  }

  return rows;
}

export async function loadHistoryValidationFindings(
  validationRunIds: string[]
): Promise<HistoryValidationFindingSummaryRow[]> {
  if (!validationRunIds.length) {
    return [];
  }

  const db = createDatabaseClient();
  const rows: HistoryValidationFindingSummaryRow[] = [];

  for (const validationRunIdBatch of chunkValues(validationRunIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data, error } = await db
      .from("validation_run_findings")
      .select(
        "id, validation_run_id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json"
      )
      .in("validation_run_id", validationRunIdBatch);

    if (error) {
      throw new Error(`Failed to load domain scan history: ${error.message}`);
    }

    rows.push(...((data ?? []) as HistoryValidationFindingSummaryRow[]));
  }

  return rows;
}

export async function loadHistoryValidationVerdicts(
  validationFindingIds: string[]
): Promise<Map<string, HistoryValidationVerdictRow>> {
  const db = createDatabaseClient();
  const verdictByFindingId = new Map<string, HistoryValidationVerdictRow>();

  if (!validationFindingIds.length) {
    return verdictByFindingId;
  }

  for (const findingIdBatch of chunkValues(validationFindingIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data, error } = await db
      .from("validation_verdicts")
      .select(
        "validation_run_finding_id, verdict, confidence, rationale, agreement_score, model, prompt_version, evidence_json, created_at, system_confidence_score, system_confidence_band, system_confidence_explanation"
      )
      .in("validation_run_finding_id", findingIdBatch)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to load domain scan history verdicts: ${error.message}`);
    }

    for (const row of (data ?? []) as HistoryValidationVerdictRow[]) {
      if (!verdictByFindingId.has(row.validation_run_finding_id)) {
        verdictByFindingId.set(row.validation_run_finding_id, row);
      }
    }
  }

  return verdictByFindingId;
}

export async function loadHistoryLegacyChangeEvents(input: {
  domainId: string;
  organizationId: string;
  scanIds: string[];
}): Promise<LegacyScanEventRow[]> {
  const db = createDatabaseClient();
  const legacyEvents: LegacyScanEventRow[] = [];
  let legacyEventsError: QueryErrorLike = null;

  for (const scanIdBatch of chunkValues(input.scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data, error } = await db
      .from("scan_events")
      .select("id, scan_id, event_type, message, metadata_json, created_at")
      .eq("organization_id", input.organizationId)
      .eq("domain_id", input.domainId)
      .in("scan_id", scanIdBatch)
      .in("event_type", [...LEGACY_CHANGE_EVENT_TYPES, SCAN_EVENT_TYPES.changesComputed])
      .order("created_at", { ascending: false });

    if (error) {
      legacyEventsError = error;
      break;
    }

    legacyEvents.push(...((data ?? []) as LegacyScanEventRow[]));
  }

  if (legacyEventsError) {
    throw new Error(`Failed to load domain scan history: ${legacyEventsError.message}`);
  }

  return legacyEvents;
}

export { isMissingComplianceChangeEventsTable };
