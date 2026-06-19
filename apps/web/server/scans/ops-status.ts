import { query, queryOne } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import { buildScanReportUnifiedFindings } from "../../components/scans/shared-scan-detail-view";
import { getAnonymousScanById, getScanById } from "./get-scan-by-id";
import { asAccessPostureClass, buildOpsInterruptionSummary } from "./ops-interruption-summary";
import { OPS_SCAN_STATUS_FINDING_IDS } from "./ops-status-finding-ids";

export type OpsScanStatusFindingId = (typeof OPS_SCAN_STATUS_FINDING_IDS)[number];

type OpsScanStatusRow = {
  completed_at: string | null;
  created_at: string;
  domain_hostname: string | null;
  egress_id: string | null;
  egress_provider: string | null;
  error_message: string | null;
  id: string;
  pages_requested: number;
  pages_scanned: number;
  scanner_region: string | null;
  scanner_slot: number | null;
  scanner_task_arn: string | null;
  scanner_task_definition_arn: string | null;
  scanner_task_revision: string | null;
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
  egress_id?: string | null;
  egress_type?: string | null;
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

function buildUnknownReportReadiness() {
  return {
    findingsReady: null,
    mergedSignalsReady: null,
    status: "unknown"
  };
}

async function loadOpsScanStatusCore(input: { organizationId: string | null; scanId: string }) {
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
              s.scanner_task_arn,
              s.scanner_task_definition_arn,
              s.scanner_task_revision,
              s.scanner_slot,
              s.scanner_region,
              s.egress_id,
              s.egress_provider,
              s.error_message,
              d.hostname as domain_hostname
         from scans s
         left join domains d on d.id = s.domain_id
        where s.id = $1
          and s.organization_id is not distinct from $2::uuid`,
      [input.scanId, input.organizationId],
      { readOnly: true }
    ),
    query<OpsScanEventRow>(
      `select event_type, message, metadata_json, created_at
         from scan_events
        where scan_id = $1
        order by created_at desc
        limit 12`,
      [input.scanId],
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
              egress_id,
              egress_type,
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
      [input.scanId],
      { readOnly: true }
    )
  ]);

  if (!scan) {
    return null;
  }

  const newestUnifiedEvent = events.find(
    (event) =>
      (
        event.event_type === SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted ||
        event.event_type === "signal_enrichment.stage_completed"
      ) &&
      getMetadataNumber(event.metadata_json, "findingCount") !== null
  );

  return {
    accessPosture: {
      accessPostureClass: asAccessPostureClass(snapshot?.access_posture_class),
      pagesScanned: scan.pages_scanned,
      stopReasonCode: snapshot?.stop_reason_code ?? null,
      stopReasonDetail: snapshot?.stop_reason_detail ?? null,
      stopReasonHttpStatus: snapshot?.stop_reason_http_status ?? null,
      stopReasonLabel: snapshot?.stop_reason_label ?? null
    },
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
    scannerRuntime: {
      awsRegion: scan.scanner_region ?? null,
      egressId: scan.egress_id ?? snapshot?.egress_id ?? null,
      egressProvider: scan.egress_provider ?? snapshot?.egress_type ?? null,
      scannerSlot: scan.scanner_slot ?? null,
      scannerTaskArn: scan.scanner_task_arn ?? null,
      scannerTaskDefinitionArn: scan.scanner_task_definition_arn ?? null,
      scannerTaskRevision: scan.scanner_task_revision ?? null
    },
    snapshot: {
      accessPostureClass: snapshot?.access_posture_class ?? null,
      authWallDetected: snapshot?.auth_wall_detected ?? null,
      authWallSuspected: snapshot?.auth_wall_suspected ?? null,
      blockedFlag: snapshot?.blocked_flag ?? null,
      blockPageClassification: snapshot?.block_page_classification ?? null,
      captchaFlag: snapshot?.captcha_flag ?? null,
      challengeSuspected: snapshot?.challenge_suspected ?? null,
      egressId: snapshot?.egress_id ?? null,
      egressType: snapshot?.egress_type ?? null,
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
    interruptionSummary: buildOpsInterruptionSummary({ events, scan, snapshot }),
    workflow: {
      latestFindingCount: newestUnifiedEvent ? getMetadataNumber(newestUnifiedEvent.metadata_json, "findingCount") : null,
      latestFindingStageAt: newestUnifiedEvent ? toIsoTimestamp(newestUnifiedEvent.created_at) : null
    }
  };
}

type OpsScanStatusCore = NonNullable<Awaited<ReturnType<typeof loadOpsScanStatusCore>>>;
type OpsScanStatusScanRecord = NonNullable<Awaited<ReturnType<typeof getAnonymousScanById>>>;

function buildOpsStatusWithoutFindings(core: OpsScanStatusCore) {
  const { scannerRuntime: _scannerRuntime, ...publicCore } = core;
  return {
    ...publicCore,
    findingCounts: buildEmptyFindingCounts(),
    reportReadiness: buildUnknownReportReadiness(),
    topFindings: []
  };
}

function buildOpsStatusWithFindings(core: OpsScanStatusCore, scanRecord: OpsScanStatusScanRecord | null) {
  if (!scanRecord) {
    return {
      ...core,
      findingCounts: buildEmptyFindingCounts(),
      reportReadiness: buildUnknownReportReadiness(),
      topFindings: []
    };
  }

  const reportPackets = buildScanReportUnifiedFindings(scanRecord);
  const executiveProjection = projectExecutiveFindingsFromUnifiedPackets(reportPackets);
  const findingCounts = buildEmptyFindingCounts();

  for (const packet of reportPackets) {
    if (
      packet.presentationDecision.status !== "suppress" &&
      OPS_SCAN_STATUS_FINDING_IDS.includes(packet.unifiedFindingId as OpsScanStatusFindingId)
    ) {
      findingCounts[packet.unifiedFindingId as OpsScanStatusFindingId] += 1;
    }
  }

  return {
    ...core,
    findingCounts,
    reportReadiness: {
      findingsReady: scanRecord.signalEnrichmentWorkflow.findingsReady,
      mergedSignalsReady: scanRecord.signalEnrichmentWorkflow.mergedSignalsReady,
      status: scanRecord.signalEnrichmentWorkflow.findingsReady ? "ready" : "finalizing"
    },
    topFindings: executiveProjection.topFindings.map((finding) => ({
      id: finding.id,
      label: finding.label,
      section: finding.section,
      severity: finding.severity
    }))
  };
}

export async function getAnonymousOpsScanStatus(input: { includeFindings?: boolean; scanId: string }) {
  const core = await loadOpsScanStatusCore({ organizationId: null, scanId: input.scanId });

  if (!core) {
    return null;
  }

  if (!input.includeFindings) {
    return buildOpsStatusWithoutFindings(core);
  }

  const scanRecord = await getAnonymousScanById(input.scanId);
  return buildOpsStatusWithFindings(core, scanRecord);
}

export async function getOrganizationOpsScanStatus(input: {
  includeFindings?: boolean;
  organizationId: string;
  scanId: string;
  viewerEmail?: string | null;
}) {
  const core = await loadOpsScanStatusCore({
    organizationId: input.organizationId,
    scanId: input.scanId
  });

  if (!core) {
    return null;
  }

  if (!input.includeFindings) {
    return buildOpsStatusWithoutFindings(core);
  }

  const scanRecord = await getScanById({
    organizationId: input.organizationId,
    scanId: input.scanId,
    viewerEmail: input.viewerEmail
  });

  return buildOpsStatusWithFindings(core, scanRecord);
}
