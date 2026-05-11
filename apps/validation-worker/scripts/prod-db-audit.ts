import { query, queryOne } from "@website-signal-risk-scanner/db";
import { deriveSignalEnrichmentWorkflowState } from "@website-signal-risk-scanner/shared";

type AuditInput = {
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
  status: string;
};

type TimingEventRow = {
  created_at: string;
  event_type: string;
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

function decodeInput(): AuditInput {
  const encoded = process.env.OPS_PROD_DB_AUDIT_INPUT_BASE64?.trim();
  const inline = process.env.OPS_PROD_DB_AUDIT_INPUT_JSON?.trim();
  const raw = encoded ? Buffer.from(encoded, "base64").toString("utf8") : inline;
  if (!raw) {
    throw new Error("OPS_PROD_DB_AUDIT_INPUT_BASE64 or OPS_PROD_DB_AUDIT_INPUT_JSON is required.");
  }
  const parsed = JSON.parse(raw) as AuditInput;
  if (!Array.isArray(parsed.scans) || parsed.scans.length === 0) {
    throw new Error("Audit input must include a non-empty scans array.");
  }
  if (parsed.scans.length > 250) {
    throw new Error("Audit input is limited to 250 scans per task.");
  }
  for (const scan of parsed.scans) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scan.scanId)) {
      throw new Error(`Invalid scanId in audit input: ${scan.scanId}`);
    }
  }
  return parsed;
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

async function runScanTimingAudit(input: AuditInput) {
  const scans = input.scans ?? [];
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
              created_at::text as created_at
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
        eventType: event.event_type
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
      signalMerge: summarizeTiming(rows.map((row) => row.timings.signalMergeDurationMs)),
      unifiedFindings: summarizeTiming(rows.map((row) => row.timings.unifiedFindingsDurationMs)),
      timeToFirstUsefulReport: summarizeTiming(rows.map((row) => row.timings.timeToFirstUsefulReportMs)),
      timeToFinalReport: summarizeTiming(rows.map((row) => row.timings.timeToFinalReportMs))
    },
    rows
  };
}

async function runRtbCookieSyncAudit(input: AuditInput) {
  const scans = input.scans ?? [];
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
      : auditName === "scan-timing"
        ? await runScanTimingAudit(input)
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
