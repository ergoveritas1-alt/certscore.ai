import { query, queryOne } from "@website-signal-risk-scanner/db";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import { buildScanReportUnifiedFindings } from "../../components/scans/shared-scan-detail-view";
import { getAnonymousScanById } from "./get-scan-by-id";
import { OPS_SCAN_STATUS_FINDING_IDS } from "./ops-status-finding-ids";

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
  access_posture_class?: string | null;
  auth_wall_detected?: boolean | null;
  auth_wall_suspected?: boolean | null;
  blocked_flag?: boolean | null;
  block_page_classification?: string | null;
  captcha_flag?: boolean | null;
  challenge_suspected?: boolean | null;
  fingerprint_block_suspected?: boolean | null;
  geo_block_suspected?: boolean | null;
  homepage_fetch_http_status?: number | null;
  homepage_fetch_status?: string | null;
  rate_limit_suspected?: boolean | null;
  report_finding_count?: number | null;
  robots_allowed?: boolean | null;
  robots_fetch_http_status?: number | null;
  robots_fetch_status?: string | null;
  scan_outcome?: string | null;
  stop_reason_code?: string | null;
  stop_reason_detail?: string | null;
  stop_reason_http_status?: number | null;
  stop_reason_label?: string | null;
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
      `select access_posture_class,
              auth_wall_detected,
              auth_wall_suspected,
              blocked_flag,
              block_page_classification,
              captcha_flag,
              challenge_suspected,
              fingerprint_block_suspected,
              geo_block_suspected,
              homepage_fetch_http_status,
              homepage_fetch_status,
              rate_limit_suspected,
              report_finding_count,
              robots_allowed,
              robots_fetch_http_status,
              robots_fetch_status,
              scan_outcome,
              stop_reason_code,
              stop_reason_detail,
              stop_reason_http_status,
              stop_reason_label,
              total_signals
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
      accessPostureClass: snapshot?.access_posture_class ?? null,
      authWallDetected: snapshot?.auth_wall_detected ?? null,
      authWallSuspected: snapshot?.auth_wall_suspected ?? null,
      blockedFlag: snapshot?.blocked_flag ?? null,
      blockPageClassification: snapshot?.block_page_classification ?? null,
      captchaFlag: snapshot?.captcha_flag ?? null,
      challengeSuspected: snapshot?.challenge_suspected ?? null,
      fingerprintBlockSuspected: snapshot?.fingerprint_block_suspected ?? null,
      geoBlockSuspected: snapshot?.geo_block_suspected ?? null,
      homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
      homepageFetchStatus: snapshot?.homepage_fetch_status ?? null,
      rateLimitSuspected: snapshot?.rate_limit_suspected ?? null,
      reportFindingCount: snapshot?.report_finding_count ?? null,
      robotsAllowed: snapshot?.robots_allowed ?? null,
      robotsFetchHttpStatus: snapshot?.robots_fetch_http_status ?? null,
      robotsFetchStatus: snapshot?.robots_fetch_status ?? null,
      scanOutcome: snapshot?.scan_outcome ?? null,
      stopReasonCode: snapshot?.stop_reason_code ?? null,
      stopReasonDetail: snapshot?.stop_reason_detail ?? null,
      stopReasonHttpStatus: snapshot?.stop_reason_http_status ?? null,
      stopReasonLabel: snapshot?.stop_reason_label ?? null,
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
