import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { closePools, query } from "@website-signal-risk-scanner/db";
import {
  classifyDsarPromotionBlockers,
  classifyPreconsentPromotionBlockers,
  summarizePromotionBlockers,
  type PromotionBlockerAssessment,
  type PromotionBlockerFindingId,
  type PromotionBlockerInput
} from "./production-promotion-blockers";
import { buildProductionFindingFrequencyReport } from "./report-production-finding-frequency";

type LineageRow = {
  bucket?: string;
  domain?: string;
  findingId?: string;
  negativeEvidenceFlags?: string[];
  packetPageUrls?: string[];
  packetSnippets?: string[];
  packetEvidence?: {
    directRuntime?: boolean;
    packetBacked?: boolean;
    pageAttribution?: boolean;
    policyText?: boolean;
    readableSnippet?: boolean;
  } | null;
  rawReasons?: string[];
  scanId?: string;
};

type LineageReport = {
  rows?: LineageRow[];
};

const DEFAULT_FOCUS_FINDINGS = [
  "preconsent_tracking",
  "missing_dsar_mechanism",
  "policy_clarity_risk",
  "privacy_contact_path_present",
  "privacy_rights_path_present",
  "cookie_disclosure_gap",
  "tracking_technologies_disclosure_present",
  "targeted_advertising_disclosure_present",
  "third_party_advertising_disclosure_present",
  "behavioral_analytics_disclosure_present",
  "consent_gated_tracking_claim_conflict"
];

type PromotionBlockerRow = {
  consent_baseline_tracker_evidence_urls: string[] | null;
  domain: string | null;
  hybrid_runtime_evidence: Record<string, unknown> | null;
  policy_coverage_ratio: number | null;
  policy_dsar_mechanism: string | null;
  policy_extraction_status: string | null;
  policy_enrichment_json: Record<string, unknown> | null;
  policy_page_url: string | null;
  policy_rights_signals: string[] | null;
  policy_semantic_confidence: number | null;
  policy_snippet_count: number | null;
  policy_structurally_weak: boolean | null;
  preconsent_tracking_detected: boolean | null;
  preconsent_violation_evidence_urls: string[] | null;
  scan_id: string;
  section_review_no_dsar_mechanism: boolean | null;
  tracking_before_consent_detected: boolean | null;
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

function parseFocusFindings() {
  const raw = getArgValue("--findings") ?? getArgValue("--finding");
  if (!raw || raw === "default") {
    return DEFAULT_FOCUS_FINDINGS;
  }
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function loadLineage(path: string | null) {
  if (!path) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as LineageReport;
  return Array.isArray(parsed.rows) ? parsed.rows : [];
}

function summarizeLineage(rows: LineageRow[] | null, findingId: string) {
  const findingRows = rows?.filter((row) => row.findingId === findingId) ?? [];
  const count = (bucket: string) => findingRows.filter((row) => row.bucket === bucket).length;
  const flags = new Map<string, number>();
  const reasons = new Map<string, number>();
  const retainedPacketEvidence = {
    directRuntime: 0,
    packetBacked: 0,
    pageAttribution: 0,
    policyText: 0,
    readableSnippet: 0
  };

  for (const row of findingRows) {
    for (const flag of row.negativeEvidenceFlags ?? []) {
      flags.set(flag, (flags.get(flag) ?? 0) + 1);
    }
    for (const reason of row.rawReasons ?? []) {
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    if (row.packetEvidence?.directRuntime) retainedPacketEvidence.directRuntime += 1;
    if (row.packetEvidence?.packetBacked) retainedPacketEvidence.packetBacked += 1;
    if (row.packetEvidence?.pageAttribution) retainedPacketEvidence.pageAttribution += 1;
    if (row.packetEvidence?.policyText) retainedPacketEvidence.policyText += 1;
    if (row.packetEvidence?.readableSnippet) retainedPacketEvidence.readableSnippet += 1;
  }

  const top = (values: Map<string, number>) =>
    [...values.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 3)
      .map(([value, valueCount]) => `${value} (${valueCount})`)
      .join(", ");

  return {
    auditOnlyMissingEvidence: count("audit_only_missing_evidence"),
    examples: findingRows
      .filter((row) =>
        row.bucket === "audit_only_missing_evidence" ||
        row.bucket === "raw_present_no_unified_packet" ||
        row.bucket === "runtime_support_only_no_disclosure_packet"
      )
      .slice(0, 5)
      .map((row) => ({
        bucket: row.bucket,
        domain: row.domain,
        negativeEvidenceFlags: (row.negativeEvidenceFlags ?? []).slice(0, 5),
        packetPageUrls: (row.packetPageUrls ?? []).slice(0, 3),
        packetSnippets: (row.packetSnippets ?? []).slice(0, 2),
        rawReasons: (row.rawReasons ?? []).slice(0, 5),
        scanId: row.scanId
      })),
    noRawEvidence: count("no_raw_evidence"),
    rawPresentNoUnifiedPacket: count("raw_present_no_unified_packet"),
    retainedPacketEvidence,
    runtimeSupportOnlyNoPacket: count("runtime_support_only_no_disclosure_packet"),
    suppressed: count("suppressed"),
    surfaced: count("surfaced"),
    topFlags: top(flags),
    topRawReasons: top(reasons)
  };
}

function classifyLikelyGap(input: {
  auditOnlyScanCount: number;
  anyStatusScanCount: number;
  lineage: ReturnType<typeof summarizeLineage>;
}) {
  const auditPressure = input.anyStatusScanCount > 0
    ? input.auditOnlyScanCount / input.anyStatusScanCount
    : 0;

  if (input.lineage.rawPresentNoUnifiedPacket > 0) {
    return "raw_present_no_unified_packet";
  }
  if (input.lineage.runtimeSupportOnlyNoPacket > 0) {
    return "runtime_support_without_policy_packet";
  }
  if (
    input.lineage.auditOnlyMissingEvidence > 0 &&
    (input.lineage.retainedPacketEvidence.policyText > 0 || input.lineage.retainedPacketEvidence.readableSnippet > 0)
  ) {
    return "packet_has_text_but_contract_failed";
  }
  if (auditPressure >= 0.5) {
    return "high_audit_pressure";
  }
  return "lower_priority";
}

function isPromotionBlockerFinding(value: string): value is PromotionBlockerFindingId {
  return value === "preconsent_tracking" || value === "missing_dsar_mechanism";
}

function toPromotionBlockerInput(row: PromotionBlockerRow): PromotionBlockerInput {
  const policyJson = row.policy_enrichment_json ?? {};
  const policyRightsSignals =
    row.policy_rights_signals ??
    (Array.isArray(policyJson.policy_rights_signals)
      ? policyJson.policy_rights_signals.filter((value): value is string => typeof value === "string")
      : []);
  return {
    consentBaselineTrackerEvidenceUrls: row.consent_baseline_tracker_evidence_urls,
    domain: row.domain,
    hybridRuntimeEvidence: row.hybrid_runtime_evidence,
    policyCoverageRatio: row.policy_coverage_ratio,
    policyDsarMechanism: row.policy_dsar_mechanism,
    policyExtractionStatus: row.policy_extraction_status,
    policyPageUrl: row.policy_page_url,
    policyRightsSignals,
    policySemanticConfidence: row.policy_semantic_confidence ?? (typeof policyJson.policy_semantic_confidence === "number" ? policyJson.policy_semantic_confidence : null),
    policySnippetCount: row.policy_snippet_count ?? (typeof policyJson.policy_snippet_count === "number" ? policyJson.policy_snippet_count : null),
    policyStructurallyWeak: row.policy_structurally_weak ?? (policyJson.policy_structurally_weak === true),
    preconsentTrackingDetected: row.preconsent_tracking_detected,
    preconsentViolationEvidenceUrls: row.preconsent_violation_evidence_urls,
    scanId: row.scan_id,
    sectionReviewNoDsarMechanism: row.section_review_no_dsar_mechanism,
    trackingBeforeConsentDetected: row.tracking_before_consent_detected
  };
}

async function loadPromotionBlockerRows(input: {
  findingId: PromotionBlockerFindingId;
  limit: number;
  scanType: string;
}) {
  const predicate =
    input.findingId === "preconsent_tracking"
      ? `(ss.preconsent_tracking_detected is true or ss.tracking_before_consent_detected is true or exists (
           select 1 from scan_signals sig
            where sig.scan_id = s.id
              and sig.signal_key = 'privacy.preconsent_tracking_detected'
              and sig.signal_value_json = 'true'::jsonb
         ))`
      : `exists (
           select 1
             from validation_runs vr
             join validation_run_findings vf on vf.validation_run_id = vr.id
            where vr.scan_id = s.id
              and vf.rule_key = 'section_review.no_dsar_mechanism'
         )`;

  const result = await query<PromotionBlockerRow>(
    `
      select s.id::text as scan_id,
             ss.domain,
             ss.preconsent_tracking_detected,
             ss.tracking_before_consent_detected,
             ra.consent_baseline_tracker_evidence_urls,
             ra.hybrid_runtime_evidence,
             coalesce(pcv.evidence_urls, '{}'::text[]) as preconsent_violation_evidence_urls,
             pe.page_url as policy_page_url,
             pe.policy_dsar_mechanism,
             to_jsonb(pe) as policy_enrichment_json,
             case
               when pe.policy_structurally_weak is true then 'structurally_weak'
               when pe.id is not null then 'fetched'
               else null
             end as policy_extraction_status,
             pe.policy_semantic_confidence,
             pe.policy_coverage_ratio,
             pe.policy_snippet_count,
             pe.policy_structurally_weak,
             exists (
               select 1
                 from validation_runs vr
                 join validation_run_findings vf on vf.validation_run_id = vr.id
                where vr.scan_id = s.id
                  and vf.rule_key = 'section_review.no_dsar_mechanism'
             ) as section_review_no_dsar_mechanism
        from scans s
        join scan_snapshots ss on ss.scan_id = s.id
        left join scan_runtime_artifacts ra on ra.scan_id = s.id
        left join lateral (
          select array_agg(distinct url) filter (where url is not null and url <> '') as evidence_urls
            from scan_preconsent_violations spv
            left join lateral unnest(spv.evidence_urls) as url on true
           where spv.scan_id = s.id
        ) pcv on true
        left join lateral (
          select *
            from policy_enrichment pe
           where pe.scan_id = s.id
             and (pe.page_type = 'privacy_policy' or pe.page_type is null)
           order by pe.created_at desc
           limit 1
        ) pe on true
       where s.status = 'completed'
         and s.organization_id is not null
         and s.scan_type = $1
         and ${predicate}
       order by s.completed_at desc nulls last
       limit $2
    `,
    [input.scanType, input.limit],
    { readOnly: true }
  );

  return result.rows;
}

async function buildPromotionBlockerDrilldowns(input: {
  findings: Set<string>;
  limit: number;
  scanType: string;
}) {
  const findingIds = [...input.findings].filter(isPromotionBlockerFinding);
  const drilldowns: Record<string, {
    assessments: Array<PromotionBlockerAssessment & { domain: string | null; scanId: string }>;
    blockerCounts: Array<[string, number]>;
    candidateCount: number;
    readyCount: number;
  }> = {};

  for (const findingId of findingIds) {
    const rows = await loadPromotionBlockerRows({ findingId, limit: input.limit, scanType: input.scanType });
    const assessments = rows.map((row) => ({
      ...(findingId === "preconsent_tracking"
        ? classifyPreconsentPromotionBlockers(toPromotionBlockerInput(row))
        : classifyDsarPromotionBlockers(toPromotionBlockerInput(row))),
      domain: row.domain,
      scanId: row.scan_id
    }));
    const summary = summarizePromotionBlockers(assessments);
    drilldowns[findingId] = {
      assessments,
      blockerCounts: summary.blockerCounts,
      candidateCount: summary.candidateCount,
      readyCount: summary.readyCount
    };
  }

  return drilldowns;
}

async function main() {
  const outputPath = getArgValue("--out");
  const lineagePath = getArgValue("--lineage");
  const scanType = getArgValue("--scan-type") ?? "full";
  const limit = getNumberArg("--limit", 30);
  const findings = new Set(parseFocusFindings());
  const lineageRows = loadLineage(lineagePath);
  const [frequency, promotionBlockers] = await Promise.all([
    buildProductionFindingFrequencyReport({
      baselinePath: null,
      includeNonSurface: true,
      limit,
      scanType
    }),
    buildPromotionBlockerDrilldowns({ findings, limit, scanType })
  ]);

  const rows = frequency.topFindings
    .filter((entry) => findings.has(entry.findingId))
    .map((entry) => {
      const lineage = summarizeLineage(lineageRows, entry.findingId);
      const auditPressure = entry.anyStatusScanCount > 0
        ? Number(((entry.auditOnlyScanCount / entry.anyStatusScanCount) * 100).toFixed(1))
        : 0;
      return {
        auditOnlyScanCount: entry.auditOnlyScanCount,
        auditPressure,
        likelyGap: classifyLikelyGap({
          auditOnlyScanCount: entry.auditOnlyScanCount,
          anyStatusScanCount: entry.anyStatusScanCount,
          lineage
        }),
        lineage,
        surfaceScanCount: entry.scanCount,
        totalScanCount: entry.anyStatusScanCount,
        findingId: entry.findingId
      };
    })
    .sort((left, right) =>
      right.auditPressure - left.auditPressure ||
      right.auditOnlyScanCount - left.auditOnlyScanCount ||
      left.findingId.localeCompare(right.findingId)
    );

  const output = {
    focusFindings: [...findings],
    generatedAt: new Date().toISOString(),
    lineageSource: lineagePath,
    promotionBlockers,
    rows,
    scope: frequency.scope
  };

  const rendered = hasFlag("--json")
    ? `${JSON.stringify(output, null, 2)}\n`
    : [
        "# Production Evidence Loss Audit",
        "",
        `Generated: ${output.generatedAt}`,
        `Scope: ${frequency.scope.scanCount} recent ${scanType} scans`,
        lineagePath ? `Lineage source: ${lineagePath}` : "Lineage source: not provided",
        "",
        "| Finding | Surface scans | Audit-only scans | Audit pressure | Likely gap | Raw/no packet | Runtime support/no packet | Audit-only missing evidence | Top flags | Top raw reasons |",
        "|---|---:|---:|---:|---|---:|---:|---:|---|---|",
        ...rows.map((row) =>
          `| \`${row.findingId}\` | ${row.surfaceScanCount} | ${row.auditOnlyScanCount} | ${row.auditPressure.toFixed(1)}% | ${row.likelyGap} | ${row.lineage.rawPresentNoUnifiedPacket} | ${row.lineage.runtimeSupportOnlyNoPacket} | ${row.lineage.auditOnlyMissingEvidence} | ${row.lineage.topFlags || "-"} | ${row.lineage.topRawReasons || "-"} |`
        ),
        "",
        "## Drilldown Examples",
        "",
        ...rows.flatMap((row) => [
          `### \`${row.findingId}\``,
          "",
          ...(row.lineage.examples.length > 0
            ? row.lineage.examples.map((example) =>
                `- ${example.domain ?? example.scanId ?? "unknown"}: ${example.bucket}; reasons=${example.rawReasons.join(", ") || "-"}; urls=${example.packetPageUrls.join(", ") || "-"}`
              )
            : ["- No lineage examples available."]),
          ""
        ]),
        "## Promotion Blockers",
        "",
        ...Object.entries(promotionBlockers).flatMap(([findingId, drilldown]) => [
          `### \`${findingId}\``,
          "",
          `Candidates sampled: ${drilldown.candidateCount}`,
          `Promotion-ready from retained evidence: ${drilldown.readyCount}`,
          "",
          "| Blocker | Count |",
          "|---|---:|",
          ...(drilldown.blockerCounts.length > 0
            ? drilldown.blockerCounts.map(([blocker, count]) => `| \`${blocker}\` | ${count} |`)
            : ["| `none` | 0 |"]),
          "",
          "Examples:",
          ...(drilldown.assessments.slice(0, 8).map((assessment) =>
            `- ${assessment.domain ?? assessment.scanId}: ${assessment.promotionReady ? "promotion_ready" : assessment.blockers.join(", ")}`
          )),
          ""
        ]),
        ""
      ].join("\n");

  if (outputPath) {
    writeFileSync(outputPath, rendered, "utf8");
  }
  process.stdout.write(rendered);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools();
  });
