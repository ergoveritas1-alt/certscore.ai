import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";
import { buildRuntimeCookieInventory } from "../lib/scans/runtime-cookie-evidence";
import { classifyPreconsentPromotionBlockers } from "./production-promotion-blockers";
import { loadScanRecord, type ScanRow } from "./report-production-finding-frequency";

type ModuleRecord = Record<string, unknown>;

type PreconsentCandidateRow = ScanRow & {
  consent_baseline_tracker_evidence_urls: string[] | null;
  domain: string | null;
  hybrid_runtime_evidence: Record<string, unknown> | null;
  preconsent_tracking_detected: boolean | null;
  preconsent_violation_evidence_urls: string[] | null;
  tracking_before_consent_detected: boolean | null;
};

type ReconciliationBucket =
  | "aligned_audit_or_absent"
  | "aligned_surface"
  | "cookie_ready_surface"
  | "promotion_ready_but_not_surfaced"
  | "request_url_ready_surface"
  | "surfaced_without_blocker_ready";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function getNumberArg(flag: string, fallback: number) {
  const raw = getArgValue(flag);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getDefaultExport<T extends ModuleRecord>(module: ModuleRecord): T {
  return ((module.default as T | undefined) ?? module) as T;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getCookieWriteSummary(hybridRuntimeEvidence: Record<string, unknown> | null | undefined) {
  const inventory = buildRuntimeCookieInventory({ hybridRuntimeEvidence });
  const beforeConsentRows = inventory.rows.filter((row) => row.timingEvidence === "before_consent_cookie_write");
  const nonEssentialRows = beforeConsentRows.filter((row) => row.nonEssential);

  return {
    beforeConsentCookieCount: beforeConsentRows.length,
    cookieObservationCount: inventory.rows.length,
    nonEssentialCookieCount: nonEssentialRows.length,
    sampleBeforeConsentCookies: beforeConsentRows.map((row) => row.cookieName).filter(Boolean).slice(0, 8),
    sampleNonEssentialCookies: nonEssentialRows.map((row) => row.cookieName).filter(Boolean).slice(0, 8)
  };
}

function classifyBucket(input: {
  blockerReady: boolean;
  concreteRequestUrlCount: number;
  nonEssentialCookieCount: number;
  status: string | null;
}) {
  if (input.blockerReady && input.status === "surface") {
    if (input.concreteRequestUrlCount > 0) {
      return "request_url_ready_surface" satisfies ReconciliationBucket;
    }
    if (input.nonEssentialCookieCount > 0) {
      return "cookie_ready_surface" satisfies ReconciliationBucket;
    }
    return "aligned_surface" satisfies ReconciliationBucket;
  }
  if (input.blockerReady) {
    return "promotion_ready_but_not_surfaced" satisfies ReconciliationBucket;
  }
  if (input.status === "surface") {
    return "surfaced_without_blocker_ready" satisfies ReconciliationBucket;
  }
  return "aligned_audit_or_absent" satisfies ReconciliationBucket;
}

async function loadCandidates(input: { limit: number; scanType: string }) {
  const result = await query<PreconsentCandidateRow>(
    `
      select s.id,
             s.organization_id,
             s.domain_id,
             s.scan_type,
             s.status,
             s.created_at,
             s.started_at,
             s.completed_at,
             s.pages_requested,
             s.pages_scanned,
             s.error_message,
             ss.domain,
             ss.preconsent_tracking_detected,
             ss.tracking_before_consent_detected,
             ra.hybrid_runtime_evidence,
             ra.consent_baseline_tracker_evidence_urls,
             coalesce(pcv.evidence_urls, '{}'::text[]) as preconsent_violation_evidence_urls
        from scans s
        join scan_snapshots ss on ss.scan_id = s.id
        left join scan_runtime_artifacts ra on ra.scan_id = s.id
        left join lateral (
          select array_agg(distinct url) filter (where url is not null and url <> '') as evidence_urls
            from scan_preconsent_violations spv
            left join lateral unnest(spv.evidence_urls) as url on true
           where spv.scan_id = s.id
        ) pcv on true
       where s.status = 'completed'
         and s.organization_id is not null
         and s.scan_type = $1
         and (
           ss.preconsent_tracking_detected is true or
           ss.tracking_before_consent_detected is true or
           exists (
             select 1 from scan_signals sig
              where sig.scan_id = s.id
                and sig.signal_key in ('privacy.preconsent_tracking_detected', 'privacy.tracking_before_consent_detected')
                and sig.signal_value_json = 'true'::jsonb
           ) or
           exists (
             select 1
               from validation_runs vr
               join validation_run_findings vf on vf.validation_run_id = vr.id
              where vr.scan_id = s.id
                and vf.rule_key = 'runtime_privacy.preconsent_tracking_observed'
           ) or
           jsonb_array_length(coalesce(ra.hybrid_runtime_evidence->'cookieWriteObservations', '[]'::jsonb)) > 0
         )
       order by s.completed_at desc nulls last
       limit $2
    `,
    [input.scanType, input.limit],
    { readOnly: true }
  );

  return result.rows;
}

async function loadBuildDependencies() {
  const [
    componentModule,
    taxonomyModule,
    mergedSignalsModule,
    hybridRuntimeModule,
    policyEnrichmentModule
  ] = await Promise.all([
    import("../components/scans/shared-scan-detail-view"),
    import("../lib/scans/signal-taxonomy"),
    import("../lib/scans/merged-signals"),
    import("../lib/scans/hybrid-runtime-evidence"),
    import("../lib/scans/policy-enrichment-row")
  ]);

  return {
    component: getDefaultExport<ModuleRecord>(componentModule as ModuleRecord),
    hybridRuntime: getDefaultExport<ModuleRecord>(hybridRuntimeModule as ModuleRecord),
    mergedSignals: getDefaultExport<ModuleRecord>(mergedSignalsModule as ModuleRecord),
    policyEnrichment: getDefaultExport<ModuleRecord>(policyEnrichmentModule as ModuleRecord),
    taxonomy: getDefaultExport<ModuleRecord>(taxonomyModule as ModuleRecord)
  };
}

function renderMarkdown(rows: Array<Record<string, unknown>>) {
  const bucketCounts = new Map<string, number>();
  for (const row of rows) {
    const bucket = String(row.bucket ?? "unknown");
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }

  const lines = [
    "# Preconsent Tracking Reconciliation",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Buckets",
    "",
    "| Bucket | Count |",
    "|---|---:|",
    ...[...bucketCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([bucket, count]) => `| \`${bucket}\` | ${count} |`),
    "",
    "## Candidates",
    "",
    "| Domain | Status | Bucket | Blockers | Requests | Cookie obs. | Before consent | Non-essential | Sample cookies | Decision reasons |",
    "|---|---|---|---|---:|---:|---:|---:|---|---|"
  ];

  for (const row of rows) {
    const blockers = Array.isArray(row.blockers) && row.blockers.length > 0 ? row.blockers.join(", ") : "-";
    const reasons = Array.isArray(row.decisionReasons) && row.decisionReasons.length > 0 ? row.decisionReasons.join(" ") : "-";
    const sampleCookies = Array.isArray(row.sampleNonEssentialCookies) && row.sampleNonEssentialCookies.length > 0
      ? row.sampleNonEssentialCookies.join(", ")
      : Array.isArray(row.sampleBeforeConsentCookies)
        ? row.sampleBeforeConsentCookies.join(", ")
        : "-";
    lines.push(
      `| ${row.domain ?? "-"} | ${row.presentationStatus ?? "no_packet"} | \`${row.bucket}\` | ${blockers} | ${row.concreteRequestUrlCount ?? 0} | ${row.cookieObservationCount ?? 0} | ${row.beforeConsentCookieCount ?? 0} | ${row.nonEssentialCookieCount ?? 0} | ${sampleCookies || "-"} | ${String(reasons).replace(/\|/g, "\\|").slice(0, 180)} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const limit = getNumberArg("--limit", 120);
  const scanType = getArgValue("--scan-type") ?? "full";
  const deps = await loadBuildDependencies();
  const buildScanReportUnifiedFindings = deps.component.buildScanReportUnifiedFindings as (record: Record<string, unknown>) => Array<Record<string, unknown>>;
  if (typeof buildScanReportUnifiedFindings !== "function") {
    throw new Error("Could not resolve buildScanReportUnifiedFindings from shared scan detail view.");
  }

  const rows = await loadCandidates({ limit, scanType });
  const output = [];

  for (const row of rows) {
    const blockerAssessment = classifyPreconsentPromotionBlockers({
      consentBaselineTrackerEvidenceUrls: row.consent_baseline_tracker_evidence_urls,
      hybridRuntimeEvidence: row.hybrid_runtime_evidence,
      preconsentTrackingDetected: row.preconsent_tracking_detected,
      preconsentViolationEvidenceUrls: row.preconsent_violation_evidence_urls,
      trackingBeforeConsentDetected: row.tracking_before_consent_detected
    });
    const scanRecord = await loadScanRecord({
      buildMergedSignalRecords: deps.mergedSignals.buildMergedSignalRecords as (input: Record<string, unknown>) => unknown[],
      getHybridDerivedTrackerVendors: deps.hybridRuntime.getHybridDerivedTrackerVendors as (runtimeArtifacts: Record<string, unknown> | null) => Array<Record<string, unknown>>,
      getPrimaryCategoryDescription: deps.taxonomy.getPrimaryCategoryDescription as (category: string) => string,
      getPrimaryCategoryLabel: deps.taxonomy.getPrimaryCategoryLabel as (category: string) => string,
      getPrimaryPolicyEnrichmentRow: deps.policyEnrichment.getPrimaryPolicyEnrichmentRow as (rows: Array<Record<string, unknown>>) => Record<string, unknown> | null,
      mapSignalKeyToTaxonomy: deps.taxonomy.mapSignalKeyToTaxonomy as (input: { category: string; key: string; label: string }) => { primaryCategory: string; subcategory?: string | null },
      scan: row,
      withHybridRuntimeArtifactFallbacks: deps.hybridRuntime.withHybridRuntimeArtifactFallbacks as (runtimeArtifacts: Record<string, unknown>) => Record<string, unknown> | null
    });
    const findings = buildScanReportUnifiedFindings(scanRecord);
    const packet = findings.find((finding) => finding.unifiedFindingId === "preconsent_tracking") ?? null;
    const presentationDecision = getRecord(packet?.presentationDecision);
    const surfacingDecision = getRecord(packet?.surfacingDecision);
    const presentationStatus = getString(presentationDecision?.status) ?? null;
    const cookieSummary = getCookieWriteSummary(row.hybrid_runtime_evidence);
    const concreteRequestUrlCount = Number(blockerAssessment.evidence.concreteRequestUrlCount ?? 0);
    const bucket = classifyBucket({
      blockerReady: blockerAssessment.promotionReady,
      concreteRequestUrlCount,
      nonEssentialCookieCount: cookieSummary.nonEssentialCookieCount,
      status: presentationStatus
    });

    output.push({
      blockerPromotionReady: blockerAssessment.promotionReady,
      blockers: blockerAssessment.blockers,
      bucket,
      concreteRequestUrlCount,
      decisionReasons: Array.isArray(surfacingDecision?.decisionReasons) ? surfacingDecision.decisionReasons : [],
      domain: row.domain,
      packetEvidenceEntities: getRecord(packet?.evidence)?.entities ?? null,
      presentationStatus,
      scanId: row.id,
      surfacingDecisionState: getString(surfacingDecision?.decisionState),
      surfacingReportLane: getString(surfacingDecision?.reportLane),
      ...cookieSummary
    });
  }

  process.stdout.write(hasFlag("--json") ? `${JSON.stringify(output, null, 2)}\n` : renderMarkdown(output));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
