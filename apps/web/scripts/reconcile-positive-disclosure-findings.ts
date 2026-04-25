import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";
import {
  classifyPositiveDisclosurePromotionBlockers,
  type PromotionBlockerFindingId
} from "./production-promotion-blockers";
import { loadScanRecord, type ScanRow } from "./report-production-finding-frequency";

type PositiveDisclosureFindingId =
  | "behavioral_analytics_disclosure_present"
  | "targeted_advertising_disclosure_present"
  | "tracking_technologies_disclosure_present";

type ModuleRecord = Record<string, unknown>;

type PositiveDisclosureCandidateRow = ScanRow & {
  domain: string | null;
  finding_id: PositiveDisclosureFindingId;
  policy_coverage_ratio: number | null;
  policy_evidence_snippets: Record<string, unknown> | null;
  policy_extraction_status: string | null;
  policy_page_type: string | null;
  policy_page_url: string | null;
  policy_positive_signal_present: boolean | null;
  policy_semantic_confidence: number | null;
  policy_snippet_count: number | null;
  policy_structurally_weak: boolean | null;
  signal_key: string;
};

type ReconciliationBucket =
  | "aligned_audit_only"
  | "aligned_surface"
  | "audit_classifier_too_loose"
  | "legitimate_support_only"
  | "missing_unified_packet"
  | "promotion_ready_but_not_surfaced";

const DEFAULT_FINDINGS: PositiveDisclosureFindingId[] = [
  "behavioral_analytics_disclosure_present",
  "targeted_advertising_disclosure_present",
  "tracking_technologies_disclosure_present"
];

const SIGNAL_KEYS: Record<PositiveDisclosureFindingId, string> = {
  behavioral_analytics_disclosure_present: "privacy.behavioral_analytics_disclosure_present",
  targeted_advertising_disclosure_present: "privacy.targeted_advertising_disclosure_present",
  tracking_technologies_disclosure_present: "privacy.tracking_technologies_disclosure_present"
};

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

function parseFindings(): PositiveDisclosureFindingId[] {
  const raw = getArgValue("--findings") ?? getArgValue("--finding");
  if (!raw || raw === "default") {
    return DEFAULT_FINDINGS;
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is PositiveDisclosureFindingId =>
      value === "behavioral_analytics_disclosure_present" ||
      value === "targeted_advertising_disclosure_present" ||
      value === "tracking_technologies_disclosure_present"
    );
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

function looksLikeEvidenceHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value.trim());
}

function collectEvidenceHashes(value: unknown): string[] {
  if (looksLikeEvidenceHash(value)) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectEvidenceHashes);
  }
  const record = getRecord(value);
  if (record) {
    return Object.values(record).flatMap(collectEvidenceHashes);
  }
  return [];
}

function resolveEvidenceHashes(value: unknown, snippetsByHash: Map<string, string>): unknown {
  if (looksLikeEvidenceHash(value)) {
    return snippetsByHash.get(value.trim()) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => resolveEvidenceHashes(entry, snippetsByHash));
  }
  const record = getRecord(value);
  if (record) {
    return Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [key, resolveEvidenceHashes(entry, snippetsByHash)])
    );
  }
  return value;
}

async function loadPolicyEvidenceByHash(hashes: string[]) {
  const uniqueHashes = [...new Set(hashes)];
  if (uniqueHashes.length === 0) {
    return new Map<string, string>();
  }

  const result = await query<{ evidence_hash: string; snippet: string }>(
    `select evidence_hash, snippet
       from policy_evidence
      where evidence_hash = any($1::text[])`,
    [uniqueHashes],
    { readOnly: true }
  );

  return new Map(result.rows.map((row) => [row.evidence_hash, row.snippet] as const));
}

function flattenSnippetValues(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenSnippetValues);
  }
  const record = getRecord(value);
  if (record) {
    return Object.values(record).flatMap(flattenSnippetValues);
  }
  return [];
}

function isWeakPolicyAnchor(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    return path === "/" || !/privacy|legal|policy|notice/.test(`${path}${parsed.search.toLowerCase()}`);
  } catch {
    return !/privacy|legal|policy|notice/i.test(value);
  }
}

function classifyBucket(input: {
  blockerReady: boolean;
  packetPresent: boolean;
  policyUrl: string | null;
  status: string | null;
}) {
  if (input.blockerReady && isWeakPolicyAnchor(input.policyUrl)) {
    return "audit_classifier_too_loose" satisfies ReconciliationBucket;
  }
  if (input.blockerReady && !input.packetPresent) {
    return "missing_unified_packet" satisfies ReconciliationBucket;
  }
  if (input.blockerReady && input.status === "surface") {
    return "aligned_surface" satisfies ReconciliationBucket;
  }
  if (input.blockerReady) {
    return "promotion_ready_but_not_surfaced" satisfies ReconciliationBucket;
  }
  if (input.status === "surface") {
    return "aligned_surface" satisfies ReconciliationBucket;
  }
  if (input.status === "audit_only" || input.status === "review" || input.status === "suppress") {
    return "aligned_audit_only" satisfies ReconciliationBucket;
  }
  return "legitimate_support_only" satisfies ReconciliationBucket;
}

async function loadCandidates(input: {
  findings: PositiveDisclosureFindingId[];
  limit: number;
  scanType: string;
}) {
  const signalEntries = input.findings.map((findingId) => [findingId, SIGNAL_KEYS[findingId]]);
  const result = await query<PositiveDisclosureCandidateRow>(
    `
      with requested_findings(finding_id, signal_key) as (
        select *
          from jsonb_to_recordset($3::jsonb) as x(finding_id text, signal_key text)
      )
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
             rf.finding_id as finding_id,
             rf.signal_key,
             pe.page_url as policy_page_url,
             pe.page_type as policy_page_type,
             exists (
               select 1 from scan_signals sig
                where sig.scan_id = s.id
                  and sig.signal_key = rf.signal_key
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
        join requested_findings rf on true
        left join lateral (
          select *
            from policy_enrichment pe
           where pe.scan_id = s.id
             and (pe.page_type = 'privacy_policy' or pe.page_type is null)
           order by case when pe.page_type = 'privacy_policy' then 0 else 1 end, pe.created_at desc
           limit 1
        ) pe on true
       where s.status = 'completed'
         and s.organization_id is not null
         and s.scan_type = $1
         and exists (
           select 1 from scan_signals sig
            where sig.scan_id = s.id
              and sig.signal_key = rf.signal_key
              and sig.signal_value_json = 'true'::jsonb
         )
       order by s.completed_at desc nulls last, rf.finding_id asc
       limit $2
    `,
    [input.scanType, input.limit, JSON.stringify(signalEntries.map(([findingId, signalKey]) => ({ finding_id: findingId, signal_key: signalKey })))],
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
    const key = `${row.findingId}:${row.bucket}`;
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
  }

  const lines = [
    "# Positive Disclosure Reconciliation",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Buckets",
    "",
    "| Finding | Bucket | Count |",
    "|---|---|---:|",
    ...[...bucketCounts.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([key, count]) => {
      const [findingId, bucket] = key.split(":");
      return `| \`${findingId}\` | \`${bucket}\` | ${count} |`;
    }),
    "",
    "## Candidates",
    "",
    "| Finding | Domain | Status | Bucket | Blockers | Policy URL | Snippets | Decision reasons |",
    "|---|---|---|---|---|---|---:|---|"
  ];

  for (const row of rows) {
    const blockers = Array.isArray(row.blockers) && row.blockers.length > 0 ? row.blockers.join(", ") : "-";
    const reasons = Array.isArray(row.decisionReasons) && row.decisionReasons.length > 0 ? row.decisionReasons.join(" ") : "-";
    lines.push(
      `| \`${row.findingId}\` | ${row.domain ?? "-"} | ${row.presentationStatus ?? "no_packet"} | \`${row.bucket}\` | ${blockers} | ${row.policyUrl ?? "-"} | ${row.snippetCount ?? 0} | ${String(reasons).replace(/\|/g, "\\|").slice(0, 180)} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const findings = parseFindings();
  const limit = getNumberArg("--limit", 80);
  const scanType = getArgValue("--scan-type") ?? "full";
  const deps = await loadBuildDependencies();
  const buildScanReportUnifiedFindings = deps.component.buildScanReportUnifiedFindings as (record: Record<string, unknown>) => Array<Record<string, unknown>>;
  if (typeof buildScanReportUnifiedFindings !== "function") {
    throw new Error("Could not resolve buildScanReportUnifiedFindings from shared scan detail view.");
  }

  const rows = await loadCandidates({ findings, limit, scanType });
  const snippetsByHash = await loadPolicyEvidenceByHash(
    rows.flatMap((row) => collectEvidenceHashes(row.policy_evidence_snippets))
  );
  const output = [];

  for (const row of rows) {
    const policyEvidenceSnippets = resolveEvidenceHashes(row.policy_evidence_snippets, snippetsByHash) as Record<string, unknown>;
    const blockerAssessment = classifyPositiveDisclosurePromotionBlockers(
      {
        policyCoverageRatio: row.policy_coverage_ratio,
        policyEvidenceSnippets,
        policyExtractionStatus: row.policy_extraction_status,
        policyPageType: row.policy_page_type,
        policyPageUrl: row.policy_page_url,
        policyPositiveSignalPresent: row.policy_positive_signal_present,
        policySemanticConfidence: row.policy_semantic_confidence,
        policySnippetCount: row.policy_snippet_count,
        policyStructurallyWeak: row.policy_structurally_weak
      },
      row.finding_id
    );
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
    const scanFindings = buildScanReportUnifiedFindings(scanRecord);
    const packet = scanFindings.find((finding) => finding.unifiedFindingId === row.finding_id) ?? null;
    const presentationDecision = getRecord(packet?.presentationDecision);
    const surfacingDecision = getRecord(packet?.surfacingDecision);
    const presentationStatus = getString(presentationDecision?.status) ?? null;
    const bucket = classifyBucket({
      blockerReady: blockerAssessment.promotionReady,
      packetPresent: Boolean(packet),
      policyUrl: row.policy_page_url,
      status: presentationStatus
    });
    const snippets = flattenSnippetValues(policyEvidenceSnippets);

    output.push({
      blockerPromotionReady: blockerAssessment.promotionReady,
      blockers: blockerAssessment.blockers,
      bucket,
      decisionReasons: Array.isArray(surfacingDecision?.decisionReasons) ? surfacingDecision.decisionReasons : [],
      domain: row.domain,
      findingId: row.finding_id,
      packetSnippetCount: Array.isArray(getRecord(packet?.evidence)?.snippets) ? (getRecord(packet?.evidence)?.snippets as unknown[]).length : 0,
      policyUrl: row.policy_page_url,
      presentationStatus,
      scanId: row.id,
      signalKey: row.signal_key,
      snippetCount: snippets.length,
      snippetPreview: snippets[0]?.slice(0, 180) ?? null,
      surfacingDecisionState: getString(surfacingDecision?.decisionState),
      surfacingReportLane: getString(surfacingDecision?.reportLane)
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
