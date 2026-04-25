import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";
import { classifyCookieDisclosureGapPromotionBlockers } from "./production-promotion-blockers";
import { loadScanRecord, type ScanRow } from "./report-production-finding-frequency";

type ModuleRecord = Record<string, unknown>;

type CookieGapCandidateRow = ScanRow & {
  cookie_gap_validation_evidence: Record<string, unknown> | null;
  domain: string | null;
  policy_coverage_ratio: number | null;
  policy_evidence_snippets: Record<string, unknown> | null;
  policy_extraction_status: string | null;
  policy_page_type: string | null;
  policy_page_url: string | null;
  policy_positive_signal_present: boolean | null;
  policy_semantic_confidence: number | null;
  policy_snippet_count: number | null;
  policy_structurally_weak: boolean | null;
};

type ReconciliationBucket =
  | "aligned_surface"
  | "aligned_audit_only"
  | "audit_too_loose"
  | "legitimate_audit_only"
  | "missing_unified_packet"
  | "surfacing_dropped_evidence";

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

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getValidationCookiePolicyUrl(evidence: Record<string, unknown> | null | undefined) {
  return getString(evidence?.cookie_policy_url ?? evidence?.cookiePolicyUrl);
}

function summarizeValidationEvidence(evidence: Record<string, unknown> | null | undefined) {
  const runtimeNames = getStringArray(evidence?.runtime_cookie_names ?? evidence?.runtimeCookieNames);
  const unmatchedNames = getStringArray(evidence?.unmatched_cookie_names ?? evidence?.unmatchedCookieNames);
  const unmatchedThirdPartyCount =
    getNumber(evidence?.unmatched_third_party_cookie_count ?? evidence?.unmatchedThirdPartyCookieCount) ??
    getNumber(evidence?.unmatched_cookie_count ?? evidence?.unmatchedCookieCount) ??
    unmatchedNames.length;

  return {
    cookiePolicyUrl: getValidationCookiePolicyUrl(evidence),
    runtimeCookieCount: runtimeNames.length,
    sampleRuntimeCookies: runtimeNames.slice(0, 6),
    sampleUnmatchedCookies: unmatchedNames.slice(0, 6),
    unmatchedCookieCount: unmatchedNames.length,
    unmatchedThirdPartyCount
  };
}

function isWeakCookiePolicyAnchor(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (path === "/") {
      return true;
    }
    if (parsed.hostname.toLowerCase() === "www.cookieyes.com" && path.startsWith("/product/")) {
      return true;
    }
    return !/cookie|privacy|legal|policy|notice/.test(`${path}${parsed.search.toLowerCase()}`);
  } catch {
    return !/cookie|privacy|legal|policy|notice/i.test(value);
  }
}

function classifyBucket(input: {
  blockerReady: boolean;
  packetPresent: boolean;
  policyUrl: string | null;
  status: string | null;
}) {
  if (input.blockerReady && isWeakCookiePolicyAnchor(input.policyUrl)) {
    return "audit_too_loose" satisfies ReconciliationBucket;
  }
  if (input.blockerReady && !input.packetPresent) {
    return "missing_unified_packet" satisfies ReconciliationBucket;
  }
  if (input.blockerReady && input.status === "surface") {
    return "aligned_surface" satisfies ReconciliationBucket;
  }
  if (input.blockerReady) {
    return "surfacing_dropped_evidence" satisfies ReconciliationBucket;
  }
  if (input.status === "surface") {
    return "aligned_surface" satisfies ReconciliationBucket;
  }
  if (input.status === "audit_only" || input.status === "review" || input.status === "suppress") {
    return "aligned_audit_only" satisfies ReconciliationBucket;
  }
  return "legitimate_audit_only" satisfies ReconciliationBucket;
}

async function loadCookieGapCandidates(input: { limit: number; scanType: string }) {
  const result = await query<CookieGapCandidateRow>(
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
             cgv.evidence as cookie_gap_validation_evidence,
             pe.page_url as policy_page_url,
             pe.page_type as policy_page_type,
             exists (
               select 1 from scan_signals sig
                where sig.scan_id = s.id
                  and sig.signal_key = 'privacy.cookie_runtime_disclosure_gap_detected'
                  and sig.signal_value_json = 'true'::jsonb
             ) as policy_positive_signal_present,
             case
               when pe.policy_structurally_weak is true then 'structurally_weak'
               when pe.id is not null then 'fetched'
               else null
             end as policy_extraction_status,
             pe.policy_semantic_confidence,
             pe.policy_coverage_ratio,
             pe.policy_snippet_count,
             pe.policy_structurally_weak,
             coalesce(to_jsonb(pe)->'policy_evidence_snippets', '{}'::jsonb) as policy_evidence_snippets
        from scans s
        join scan_snapshots ss on ss.scan_id = s.id
        left join lateral (
          select vf.evidence_json as evidence
            from validation_runs vr
            join validation_run_findings vf on vf.validation_run_id = vr.id
           where vr.scan_id = s.id
             and vf.rule_key = 'cookie_runtime.disclosure_gap'
           order by vf.created_at desc nulls last
           limit 1
        ) cgv on true
        left join lateral (
          select *
            from policy_enrichment pe
           where pe.scan_id = s.id
             and (pe.page_type in ('cookie_policy', 'privacy_policy') or pe.page_type is null)
           order by case when pe.page_type = 'cookie_policy' then 0 else 1 end, pe.created_at desc
           limit 1
        ) pe on true
       where s.status = 'completed'
         and s.organization_id is not null
         and s.scan_type = $1
         and (
           cgv.evidence is not null or exists (
             select 1 from scan_signals sig
              where sig.scan_id = s.id
                and sig.signal_key = 'privacy.cookie_runtime_disclosure_gap_detected'
                and sig.signal_value_json = 'true'::jsonb
           )
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
    "# Cookie Disclosure Gap Reconciliation",
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
    "| Domain | Status | Bucket | Blockers | Policy URL | Runtime | Unmatched third-party | Decision reasons |",
    "|---|---|---|---|---|---:|---:|---|"
  ];

  for (const row of rows) {
    const blockers = Array.isArray(row.blockers) && row.blockers.length > 0 ? row.blockers.join(", ") : "-";
    const reasons = Array.isArray(row.decisionReasons) && row.decisionReasons.length > 0 ? row.decisionReasons.join(" ") : "-";
    lines.push(
      `| ${row.domain ?? "-"} | ${row.presentationStatus ?? "no_packet"} | \`${row.bucket}\` | ${blockers} | ${row.policyUrl ?? "-"} | ${row.runtimeCookieCount ?? 0} | ${row.unmatchedThirdPartyCount ?? 0} | ${String(reasons).replace(/\|/g, "\\|").slice(0, 180)} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const limit = getNumberArg("--limit", 80);
  const scanType = getArgValue("--scan-type") ?? "full";
  const deps = await loadBuildDependencies();
  const buildScanReportUnifiedFindings = deps.component.buildScanReportUnifiedFindings as (record: Record<string, unknown>) => Array<Record<string, unknown>>;
  if (typeof buildScanReportUnifiedFindings !== "function") {
    throw new Error("Could not resolve buildScanReportUnifiedFindings from shared scan detail view.");
  }

  const rows = await loadCookieGapCandidates({ limit, scanType });
  const output = [];

  for (const row of rows) {
    const validationEvidence = getRecord(row.cookie_gap_validation_evidence);
    const validationSummary = summarizeValidationEvidence(validationEvidence);
    const effectivePolicyUrl = row.policy_page_url ?? validationSummary.cookiePolicyUrl;
    const blockerAssessment = classifyCookieDisclosureGapPromotionBlockers({
      cookieGapValidationEvidence: validationEvidence,
      policyCoverageRatio: row.policy_coverage_ratio,
      policyEvidenceSnippets: row.policy_evidence_snippets,
      policyExtractionStatus: row.policy_extraction_status,
      policyPageType: row.policy_page_type,
      policyPageUrl: effectivePolicyUrl,
      policyPositiveSignalPresent: row.policy_positive_signal_present,
      policySemanticConfidence: row.policy_semantic_confidence,
      policySnippetCount: row.policy_snippet_count,
      policyStructurallyWeak: row.policy_structurally_weak
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
    const packet = findings.find((finding) => finding.unifiedFindingId === "cookie_disclosure_gap") ?? null;
    const presentationDecision = getRecord(packet?.presentationDecision);
    const surfacingDecision = getRecord(packet?.surfacingDecision);
    const presentationStatus = getString(presentationDecision?.status) ?? null;
    const bucket = classifyBucket({
      blockerReady: blockerAssessment.promotionReady,
      packetPresent: Boolean(packet),
      policyUrl: effectivePolicyUrl,
      status: presentationStatus
    });

    output.push({
      blockerPromotionReady: blockerAssessment.promotionReady,
      blockers: blockerAssessment.blockers,
      bucket,
      decisionReasons: Array.isArray(surfacingDecision?.decisionReasons) ? surfacingDecision.decisionReasons : [],
      domain: row.domain,
      packetEvidenceCounts: getRecord(packet?.evidence)?.counts ?? null,
      packetEvidenceEntities: getRecord(packet?.evidence)?.entities ?? null,
      policyUrl: effectivePolicyUrl,
      presentationStatus,
      scanId: row.id,
      surfacingDecisionState: getString(surfacingDecision?.decisionState),
      surfacingReportLane: getString(surfacingDecision?.reportLane),
      ...validationSummary
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
