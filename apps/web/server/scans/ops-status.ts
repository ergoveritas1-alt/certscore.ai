import { query, queryOne } from "@website-signal-risk-scanner/db";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import { buildScanReportUnifiedFindings } from "../../components/scans/shared-scan-detail-view";
import { getAnonymousScanById } from "./get-scan-by-id";

export const OPS_SCAN_STATUS_FINDING_IDS = [
  "pre_consent_tracking_detected",
  "accessibility_risk_score",
  "cross_domain_identifier_sharing_observed",
  "cpra_cba_opt_out_missing",
  "reject_tracking_persists_after_reject",
  "session_recording_services_detected",
  "third_party_cookie_pre_consent",
  "sensitive_data_collection_with_third_party_tracking_present",
  "session_replay_on_sensitive_input_surface",
  "consent_dark_patterns_detected",
  "reject_option_missing_or_hidden",
  "fingerprinting_related_signals_observed",
  "probable_fingerprinting"
] as const;

export type OpsScanStatusFindingId = (typeof OPS_SCAN_STATUS_FINDING_IDS)[number];

type OpsScanStatusRow = {
  completed_at: string | null;
  created_at: string;
  domain_hostname: string | null;
  error_message: string | null;
  id: string;
  pages_requested: number;
  pages_scanned: number;
  scan_type: string;
  started_at: string | null;
  status: string;
};

type OpsScanEventRow = {
  created_at: string;
  event_type: string;
  message: string;
  metadata_json: unknown;
};

type OpsSnapshotRow = {
  report_finding_count?: number | null;
  scan_outcome?: string | null;
  stop_reason_code?: string | null;
  stop_reason_detail?: string | null;
  total_signals?: number | null;
};

function toIsoTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function getMetadataNumber(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildEmptyFindingCounts() {
  return Object.fromEntries(OPS_SCAN_STATUS_FINDING_IDS.map((findingId) => [findingId, 0])) as Record<OpsScanStatusFindingId, number>;
}

async function loadOpsScanStatusCore(scanId: string) {
  const [scan, events, snapshot] = await Promise.all([
    queryOne<OpsScanStatusRow>(
      `select s.id,
              s.scan_type,
              s.status,
              s.pages_requested,
              s.pages_scanned,
              s.created_at,
              s.started_at,
              s.completed_at,
              s.error_message,
              d.hostname as domain_hostname
         from scans s
         left join domains d on d.id = s.domain_id
        where s.id = $1
          and s.organization_id is null`,
      [scanId],
      { readOnly: true }
    ),
    query<OpsScanEventRow>(
      `select event_type, message, metadata_json, created_at
         from scan_events
        where scan_id = $1
        order by created_at desc
        limit 12`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    queryOne<OpsSnapshotRow>(
      `select report_finding_count, scan_outcome, stop_reason_code, stop_reason_detail, total_signals
         from scan_snapshots
        where scan_id = $1`,
      [scanId],
      { readOnly: true }
    )
  ]);

  if (!scan) {
    return null;
  }

  const newestUnifiedEvent = events.find((event) => event.event_type === "signal_enrichment.stage_completed" && getMetadataNumber(event.metadata_json, "findingCount") !== null);

  return {
    domain: scan.domain_hostname,
    events: events.map((event) => ({
      createdAt: toIsoTimestamp(event.created_at),
      eventType: event.event_type,
      message: event.message,
      metadata: event.metadata_json
    })),
    scan: {
      completedAt: toIsoTimestamp(scan.completed_at),
      createdAt: toIsoTimestamp(scan.created_at),
      errorMessage: scan.error_message,
      id: scan.id,
      pagesRequested: scan.pages_requested,
      pagesScanned: scan.pages_scanned,
      scanType: scan.scan_type,
      startedAt: toIsoTimestamp(scan.started_at),
      status: scan.status
    },
    snapshot: {
      reportFindingCount: snapshot?.report_finding_count ?? null,
      scanOutcome: snapshot?.scan_outcome ?? null,
      stopReasonCode: snapshot?.stop_reason_code ?? null,
      stopReasonDetail: snapshot?.stop_reason_detail ?? null,
      totalSignals: snapshot?.total_signals ?? null
    },
    workflow: {
      latestFindingCount: newestUnifiedEvent ? getMetadataNumber(newestUnifiedEvent.metadata_json, "findingCount") : null,
      latestFindingStageAt: newestUnifiedEvent ? toIsoTimestamp(newestUnifiedEvent.created_at) : null
    }
  };
}

export async function getAnonymousOpsScanStatus(input: { includeFindings?: boolean; scanId: string }) {
  const core = await loadOpsScanStatusCore(input.scanId);

  if (!core) {
    return null;
  }

  if (!input.includeFindings) {
    return {
      ...core,
      findingCounts: buildEmptyFindingCounts(),
      topFindings: []
    };
  }

  const scanRecord = await getAnonymousScanById(input.scanId);

  if (!scanRecord) {
    return {
      ...core,
      findingCounts: buildEmptyFindingCounts(),
      topFindings: []
    };
  }

  const reportPackets = buildScanReportUnifiedFindings(scanRecord);
  const executiveProjection = projectExecutiveFindingsFromUnifiedPackets(reportPackets);
  const findingCounts = buildEmptyFindingCounts();

  for (const finding of executiveProjection.findings) {
    if (OPS_SCAN_STATUS_FINDING_IDS.includes(finding.id as OpsScanStatusFindingId)) {
      findingCounts[finding.id as OpsScanStatusFindingId] += 1;
    }
  }

  return {
    ...core,
    findingCounts,
    topFindings: executiveProjection.topFindings.map((finding) => ({
      id: finding.id,
      label: finding.label,
      section: finding.section,
      severity: finding.severity
    }))
  };
}
