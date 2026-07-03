import { createHash } from "node:crypto";
import { existsSync, lstatSync, readlinkSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { buildNormalizedConcerns } from "../apps/web/lib/scans/normalized-concerns";
import { deriveGdprEprivacyCoverageChecklist } from "../apps/web/lib/scans/gdpr-eprivacy-coverage-checklist";
import {
  deriveGdprEprivacyCoveragePolicyOutcomes,
  type GdprEprivacyCoverageOutcome,
} from "../apps/web/lib/scans/gdpr-eprivacy-coverage-policy";

type Args = {
  artifactRoot: string;
  outDir: string;
};

type LocalV2DagReportExports = {
  dedupePolicySurfaces: (surfaces: readonly Record<string, unknown>[], fallbackBaseUrl: string | null) => Array<{
    pageUrl: string | null;
    surface: Record<string, unknown>;
  }>;
  summarizePolicySurfaces: (
    policySurfaces: Array<{ pageUrl: string | null; surface: Record<string, unknown> }>,
    rootDomain: string | null,
    options?: { gdprTransparencyEvidenceProfile?: string | null },
  ) => Record<string, unknown>;
};

type SharedScanDetailExports = {
  deriveSharedScanDetailGdprEprivacyCoverageChecklist: (input: {
    coverageLimited: boolean;
    events?: unknown[];
    policyEnrichmentCount: number;
    projectedFindings?: unknown[];
    runtimeArtifacts: Record<string, unknown>;
    runtimeCookieRows?: unknown[];
    runtimeTrackerPriorityRows?: unknown[];
    scanCompleted: boolean;
    snapshot: Record<string, unknown>;
    unifiedFindings: unknown[];
  }) => ReturnType<typeof deriveGdprEprivacyCoverageChecklist>;
};

type ChecklistComparisonReport = {
  reportVersion: "certscore.multilingual_privacy_evidence_checklist_local_comparison.1";
  artifactRoot: string;
  generatedAt: string;
  guardrails: string[];
  localPolicyTextArtifactMirrorRoot: string;
  rows: ChecklistComparisonRow[];
  totals: {
    acceptedProductionSignalSites: number;
    defaultObservedArticle13Rows: number;
    optInNewObservedArticle13Rows: number;
    optInObservedArticle13Rows: number;
    optInReviewSignalArticle13Rows: number;
    sharedScanDetailMismatchSites: number;
    sitesCompared: number;
    sitesWithChecklistDelta: number;
  };
};

type ChecklistComparisonRow = {
  key: string;
  url: string;
  artifactDir: string;
  status: "compared" | "missing_bundle" | "failed";
  error?: string;
  defaultProfile?: string;
  optInProfile?: string;
  defaultArticle13SignalCount?: number;
  optInArticle13SignalCount?: number;
  acceptedProductionSignalCount?: number;
  diagnosticCandidateCount?: number;
  rejectedCandidateCount?: number;
  normalizedConcernCount?: number;
  normalizedConcernEligibilityCounts?: Record<string, number>;
  defaultObservedRows?: string[];
  optInObservedRows?: string[];
  optInReviewSignalRows?: string[];
  newlyObservedRows?: string[];
  sharedScanDetailDefaultObservedRows?: string[];
  sharedScanDetailOptInObservedRows?: string[];
  sharedScanDetailMismatchRows?: string[];
  acceptedEvidence?: Array<{
    disclosureType: string;
    rowId: string;
    locale?: string;
    matchStrength?: string;
    matchedTerm?: string;
    excerpt?: string;
    sourceUrl?: string;
  }>;
  changedRows?: Array<{
    defaultStatus: string;
    optInStatus: string;
    rowId: string;
  }>;
};

const GDPR_ARTICLE13_ROW_IDS = [
  "controller_contact_disclosure",
  "processing_purposes_disclosure",
  "legal_basis_disclosure_observed",
  "recipients_vendor_categories_disclosure",
  "retention_disclosure_observed",
  "data_subject_rights_disclosure",
  "international_transfers_disclosure",
  "dpo_contact_point_disclosure",
  "supervisory_authority_complaint_disclosure",
  "automated_decision_making_profiling_disclosure",
] as const;

const GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE = "gdpr_transparency_multilingual_article13_v1";

const ARTICLE13_TOPIC_TO_ROW_ID: Record<string, string> = {
  automated_decision_making_or_profiling: "automated_decision_making_profiling_disclosure",
  controller_contact: "controller_contact_disclosure",
  data_retention: "retention_disclosure_observed",
  data_subject_rights: "data_subject_rights_disclosure",
  dpo_contact: "dpo_contact_point_disclosure",
  international_transfers: "international_transfers_disclosure",
  legal_basis: "legal_basis_disclosure_observed",
  processing_purposes: "processing_purposes_disclosure",
  recipients_or_vendor_categories: "recipients_vendor_categories_disclosure",
  supervisory_authority: "supervisory_authority_complaint_disclosure",
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localReport = await loadLocalV2DagReport();
  const sharedScanDetail = await loadSharedScanDetail();
  const targets = await bundleTargets(args.artifactRoot);
  await mkdir(args.outDir, { recursive: true });

  const rows: ChecklistComparisonRow[] = [];
  for (const target of targets.entries) {
    try {
      rows.push(await compareBundle(target, localReport, sharedScanDetail));
    } catch (error) {
      rows.push({
        key: target.key,
        url: "",
        artifactDir: target.artifactDir,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report: ChecklistComparisonReport = {
    reportVersion: "certscore.multilingual_privacy_evidence_checklist_local_comparison.1",
    artifactRoot: args.artifactRoot,
    generatedAt: new Date().toISOString(),
    guardrails: [
      "local_artifact_only",
      "compares_legacy_only_to_explicit_gdpr_transparency_multilingual_article13_v1",
      "uses_local_v2_materialization_policy_summary_and_normalized_concern_pipeline",
      "verifies_shared_scan_detail_checklist_helper_matches_direct_pipeline",
      "does_not_read_gdprTransparencyTopicCandidates_outside_materialization_summary",
      "does_not_create_unified_findings_or_display_fallbacks",
      "does_not_click_consent_controls",
    ],
    localPolicyTextArtifactMirrorRoot: targets.mirrorRoot,
    rows,
    totals: {
      acceptedProductionSignalSites: rows.filter((row) => (row.acceptedProductionSignalCount ?? 0) > 0).length,
      defaultObservedArticle13Rows: rows.reduce((sum, row) => sum + (row.defaultObservedRows?.length ?? 0), 0),
      optInNewObservedArticle13Rows: rows.reduce((sum, row) => sum + (row.newlyObservedRows?.length ?? 0), 0),
      optInObservedArticle13Rows: rows.reduce((sum, row) => sum + (row.optInObservedRows?.length ?? 0), 0),
      optInReviewSignalArticle13Rows: rows.reduce((sum, row) => sum + (row.optInReviewSignalRows?.length ?? 0), 0),
      sharedScanDetailMismatchSites: rows.filter((row) => (row.sharedScanDetailMismatchRows?.length ?? 0) > 0).length,
      sitesCompared: rows.filter((row) => row.status === "compared").length,
      sitesWithChecklistDelta: rows.filter((row) => (row.changedRows?.length ?? 0) > 0).length,
    },
  };

  await writeFile(path.join(args.outDir, "multilingual-local-checklist-comparison.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(path.join(args.outDir, "multilingual-local-checklist-comparison.tsv"), `${comparisonTsv(rows)}\n`, "utf8");
  await writeFile(path.join(args.outDir, "multilingual-local-checklist-comparison-row-deltas.tsv"), `${deltaTsv(rows)}\n`, "utf8");
  await writeFile(path.join(args.outDir, "index.html"), htmlReport(report), "utf8");
  console.log(`Wrote ${path.join(args.outDir, "multilingual-local-checklist-comparison.json")}`);
  console.log(`Wrote ${path.join(args.outDir, "index.html")}`);
}

async function compareBundle(
  target: { artifactDir: string; bundlePath: string; key: string; mirroredArtifactDir: string },
  localReport: LocalV2DagReportExports,
  sharedScanDetail: SharedScanDetailExports,
): Promise<ChecklistComparisonRow> {
  if (!existsSync(target.bundlePath)) {
    return {
      key: target.key,
      url: "",
      artifactDir: target.artifactDir,
      status: "missing_bundle",
    };
  }

  await ensureArtifactMirror(target.artifactDir, target.mirroredArtifactDir);
  const rawBundle = JSON.parse(await readFile(target.bundlePath, "utf8")) as unknown;
  const bundle = asRecord(remapArtifactPaths(rawBundle, target.artifactDir, target.mirroredArtifactDir));
  const normalizedUrl = stringOrUndefined(bundle.normalizedUrl) ?? stringOrUndefined(bundle.url) ?? "";
  const rootDomain = hostnameFromUrl(normalizedUrl);
  const policySurfaces = localReport.dedupePolicySurfaces(arrayOfRecords(bundle.policySurfaceObservations), normalizedUrl || null);
  const defaultSummary = localReport.summarizePolicySurfaces(policySurfaces, rootDomain);
  const optInSummary = localReport.summarizePolicySurfaces(policySurfaces, rootDomain, {
    gdprTransparencyEvidenceProfile: GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE,
  });

  const defaultRuntimeArtifacts = runtimeArtifactsFor(defaultSummary);
  const optInRuntimeArtifacts = runtimeArtifactsFor(optInSummary);
  const defaultConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts: defaultRuntimeArtifacts,
    validationFindings: [],
  });
  const optInConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts: optInRuntimeArtifacts,
    validationFindings: [],
  });
  const defaultChecklist = checklistFor(defaultRuntimeArtifacts, defaultConcerns);
  const optInChecklist = checklistFor(optInRuntimeArtifacts, optInConcerns);
  const sharedDefaultChecklist = sharedChecklistFor(defaultRuntimeArtifacts, sharedScanDetail);
  const sharedOptInChecklist = sharedChecklistFor(optInRuntimeArtifacts, sharedScanDetail);
  const defaultStatuses = article13Statuses(defaultChecklist);
  const optInStatuses = article13Statuses(optInChecklist);
  const sharedDefaultStatuses = article13Statuses(sharedDefaultChecklist);
  const sharedOptInStatuses = article13Statuses(sharedOptInChecklist);
  const changedRows = GDPR_ARTICLE13_ROW_IDS.flatMap((rowId) => {
    const defaultStatus = defaultStatuses.get(rowId) ?? "missing";
    const optInStatus = optInStatuses.get(rowId) ?? "missing";
    return defaultStatus === optInStatus ? [] : [{ defaultStatus, optInStatus, rowId }];
  });
  const defaultObservedRows = rowsWithStatus(defaultStatuses, "Observed");
  const optInObservedRows = rowsWithStatus(optInStatuses, "Observed");
  const optInReviewSignalRows = rowsWithStatus(optInStatuses, "Review signal");
  const sharedScanDetailDefaultObservedRows = rowsWithStatus(sharedDefaultStatuses, "Observed");
  const sharedScanDetailOptInObservedRows = rowsWithStatus(sharedOptInStatuses, "Observed");
  const sharedScanDetailMismatchRows = GDPR_ARTICLE13_ROW_IDS.filter((rowId) =>
    defaultStatuses.get(rowId) !== sharedDefaultStatuses.get(rowId) ||
    optInStatuses.get(rowId) !== sharedOptInStatuses.get(rowId)
  );

  return {
    key: target.key,
    url: normalizedUrl,
    artifactDir: target.artifactDir,
    status: "compared",
    defaultProfile: stringOrUndefined(defaultSummary.gdprTransparencyEvidenceProfile),
    optInProfile: stringOrUndefined(optInSummary.gdprTransparencyEvidenceProfile),
    defaultArticle13SignalCount: arrayOfRecords(defaultSummary.article13DisclosureSignals).length,
    optInArticle13SignalCount: arrayOfRecords(optInSummary.article13DisclosureSignals).length,
    acceptedProductionSignalCount: numberOrZero(asRecord(optInSummary.gdprTransparencyProductionEvidenceDiagnostics).productionCreditSignalCount),
    diagnosticCandidateCount: numberOrZero(asRecord(optInSummary.gdprTransparencyProductionEvidenceDiagnostics).diagnosticCandidateCount),
    rejectedCandidateCount: numberOrZero(asRecord(optInSummary.gdprTransparencyProductionEvidenceDiagnostics).rejectedCandidateCount),
    normalizedConcernCount: optInConcerns.filter((concern) =>
      concern.evidenceBundle.rawEvidence?.gdprTransparencyArticle13Evidence === true
    ).length,
    normalizedConcernEligibilityCounts: countBy(optInConcerns
      .filter((concern) => concern.evidenceBundle.rawEvidence?.gdprTransparencyArticle13Evidence === true)
      .map((concern) => String(concern.regulatoryChecklistEligibility ?? "unknown"))),
    defaultObservedRows,
    optInObservedRows,
    optInReviewSignalRows,
    newlyObservedRows: optInObservedRows.filter((rowId) => !defaultObservedRows.includes(rowId)),
    sharedScanDetailDefaultObservedRows,
    sharedScanDetailOptInObservedRows,
    sharedScanDetailMismatchRows,
    acceptedEvidence: arrayOfRecords(optInSummary.article13DisclosureSignals)
      .filter((signal) =>
        signal.productionCredit === true &&
        signal.productionCreditProfile === GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE
      )
      .map((signal) => {
        const disclosureType = stringOrUndefined(signal.disclosureType) ?? "unknown";
        return {
          disclosureType,
          rowId: ARTICLE13_TOPIC_TO_ROW_ID[disclosureType] ?? disclosureType,
          locale: stringOrUndefined(signal.matchedLocale),
          matchStrength: stringOrUndefined(signal.matchStrength),
          matchedTerm: stringOrUndefined(signal.matchedTerm),
          excerpt: truncate(stringOrUndefined(signal.selectedPolicySectionExcerpt) ?? stringOrUndefined(signal.evidenceText), 360),
          sourceUrl: stringOrUndefined(signal.selectedPolicySectionUrl) ?? stringOrUndefined(signal.surfaceUrl),
        };
      }),
    changedRows,
  };
}

function checklistFor(runtimeArtifacts: Record<string, unknown>, normalizedConcerns: ReturnType<typeof buildNormalizedConcerns>) {
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited: false,
    normalizedConcerns,
    runtimeArtifacts,
    scanCompleted: true,
    snapshot: {},
  });
  return deriveGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    coverageOutcomes,
    projectedFindings: [],
    scanCompleted: true,
    unifiedFindings: [],
  });
}

function sharedChecklistFor(runtimeArtifacts: Record<string, unknown>, sharedScanDetail: SharedScanDetailExports) {
  return sharedScanDetail.deriveSharedScanDetailGdprEprivacyCoverageChecklist({
    coverageLimited: false,
    events: [],
    policyEnrichmentCount: 0,
    projectedFindings: [],
    runtimeArtifacts,
    runtimeCookieRows: [],
    runtimeTrackerPriorityRows: [],
    scanCompleted: true,
    snapshot: {},
    unifiedFindings: [],
  });
}

function runtimeArtifactsFor(policyDisclosureSummary: Record<string, unknown>) {
  return {
    gdprTransparencyEvidenceProfile: policyDisclosureSummary.gdprTransparencyEvidenceProfile,
    gdprTransparencyProductionEvidenceDiagnostics: policyDisclosureSummary.gdprTransparencyProductionEvidenceDiagnostics,
    gdprTransparencyProductionEvidenceEnabled: policyDisclosureSummary.gdprTransparencyProductionEvidenceEnabled,
    policyDisclosureSummary,
    policy_disclosure_summary: policyDisclosureSummary,
  };
}

function article13Statuses(items: ReturnType<typeof deriveGdprEprivacyCoverageChecklist>) {
  return new Map(items
    .filter((item) => (GDPR_ARTICLE13_ROW_IDS as readonly string[]).includes(item.id))
    .map((item) => [item.id, item.status]));
}

function rowsWithStatus(statuses: Map<string, string>, status: string) {
  return GDPR_ARTICLE13_ROW_IDS.filter((rowId) => statuses.get(rowId) === status);
}

function comparisonTsv(rows: ChecklistComparisonRow[]) {
  return [
    [
      "key",
      "status",
      "defaultSignals",
      "optInSignals",
      "acceptedProductionSignals",
      "diagnosticCandidates",
      "rejectedCandidates",
      "normalizedConcerns",
      "eligibilityCounts",
      "defaultObservedRows",
      "optInObservedRows",
      "optInReviewSignalRows",
      "newlyObservedRows",
      "sharedScanDetailDefaultObservedRows",
      "sharedScanDetailOptInObservedRows",
      "sharedScanDetailMismatchRows",
      "changedRows",
    ].join("\t"),
    ...rows.map((row) => [
      row.key,
      row.status,
      row.defaultArticle13SignalCount ?? "",
      row.optInArticle13SignalCount ?? "",
      row.acceptedProductionSignalCount ?? "",
      row.diagnosticCandidateCount ?? "",
      row.rejectedCandidateCount ?? "",
      row.normalizedConcernCount ?? "",
      formatCountRecord(row.normalizedConcernEligibilityCounts),
      row.defaultObservedRows?.join(",") ?? "",
      row.optInObservedRows?.join(",") ?? "",
      row.optInReviewSignalRows?.join(",") ?? "",
      row.newlyObservedRows?.join(",") ?? "",
      row.sharedScanDetailDefaultObservedRows?.join(",") ?? "",
      row.sharedScanDetailOptInObservedRows?.join(",") ?? "",
      row.sharedScanDetailMismatchRows?.join(",") ?? "",
      row.changedRows?.map((change) => `${change.rowId}:${change.defaultStatus}->${change.optInStatus}`).join(",") ?? "",
    ].map(tsvCell).join("\t")),
  ].join("\n");
}

function deltaTsv(rows: ChecklistComparisonRow[]) {
  const lines = ["key\trowId\tdefaultStatus\toptInStatus"];
  for (const row of rows) {
    for (const change of row.changedRows ?? []) {
      lines.push([row.key, change.rowId, change.defaultStatus, change.optInStatus].map(tsvCell).join("\t"));
    }
  }
  return lines.join("\n");
}

function htmlReport(report: ChecklistComparisonReport) {
  const deltaRows = report.rows
    .filter((row) => row.status === "compared" && (row.changedRows?.length ?? 0) > 0)
    .sort((left, right) => {
      const langCompare = left.key.slice(0, 2).localeCompare(right.key.slice(0, 2));
      return langCompare || left.key.localeCompare(right.key);
    });
  const noDeltaRows = report.rows
    .filter((row) => row.status === "compared" && (row.changedRows?.length ?? 0) === 0)
    .sort((left, right) => left.key.localeCompare(right.key));
  const failedRows = report.rows.filter((row) => row.status !== "compared");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Multilingual GDPR Transparency Local Checklist Review</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; background: #f6f7f9; }
    body { margin: 0; }
    main { max-width: 1240px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 28px; line-height: 1.2; margin: 0 0 8px; letter-spacing: 0; }
    h2 { font-size: 18px; margin: 28px 0 12px; letter-spacing: 0; }
    h3 { font-size: 15px; margin: 0; letter-spacing: 0; }
    p { line-height: 1.5; }
    .lede { color: #52606d; margin: 0 0 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(178px, 1fr)); gap: 10px; margin: 18px 0 22px; }
    .metric, .site { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
    .metric { padding: 14px; }
    .metric b { display: block; font-size: 24px; line-height: 1.1; }
    .metric span { color: #52606d; font-size: 12px; }
    .guardrails { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; list-style: none; }
    .guardrails li, .pill { border: 1px solid #ccd4df; background: #fff; color: #354253; border-radius: 999px; padding: 4px 8px; font-size: 12px; }
    .site { margin: 12px 0; overflow: hidden; }
    .site-header { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid #e5e9ef; background: #fbfcfd; }
    .site-url { color: #52606d; font-size: 12px; word-break: break-all; margin-top: 3px; }
    .site-body { padding: 14px 16px 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; vertical-align: top; border-bottom: 1px solid #edf0f4; padding: 8px 6px; }
    th { color: #52606d; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    code { background: #eef2f7; border-radius: 4px; padding: 1px 4px; font-size: 12px; }
    .status-observed { color: #116329; font-weight: 700; }
    .status-review { color: #8a4b00; font-weight: 700; }
    .status-muted { color: #667789; }
    .evidence { display: grid; gap: 8px; margin-top: 12px; }
    .evidence-row { border-left: 3px solid #4d7cfe; padding: 8px 10px; background: #f8faff; border-radius: 6px; }
    .evidence-meta { color: #52606d; font-size: 12px; margin-bottom: 4px; }
    .excerpt { color: #263241; line-height: 1.45; }
    .warning { border-color: #d97706; background: #fff8eb; }
    .empty { color: #52606d; background: #fff; border: 1px dashed #ccd4df; border-radius: 8px; padding: 14px; }
  </style>
</head>
<body>
<main>
  <h1>Multilingual GDPR Transparency Local Checklist Review</h1>
  <p class="lede">Generated from local artifacts only. This compares <code>legacy_only</code> with explicit <code>${escapeHtml(GDPR_TRANSPARENCY_MULTILINGUAL_ARTICLE13_PROFILE)}</code> checklist behavior.</p>
  <section class="grid">
    ${metric("Sites compared", report.totals.sitesCompared)}
    ${metric("Sites with checklist delta", report.totals.sitesWithChecklistDelta)}
    ${metric("Accepted production-signal sites", report.totals.acceptedProductionSignalSites)}
    ${metric("Default Observed Article 13 rows", report.totals.defaultObservedArticle13Rows)}
    ${metric("Opt-in new Observed rows", report.totals.optInNewObservedArticle13Rows)}
    ${metric("Shared detail mismatches", report.totals.sharedScanDetailMismatchSites)}
  </section>
  <h2>Guardrails</h2>
  <ul class="guardrails">${report.guardrails.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  <h2>Opt-in Checklist Deltas (${deltaRows.length})</h2>
  ${deltaRows.length > 0 ? deltaRows.map(siteCard).join("") : `<div class="empty">No opt-in checklist deltas.</div>`}
  <h2>No Checklist Delta (${noDeltaRows.length})</h2>
  <div class="site"><div class="site-body">${noDeltaRows.map((row) => `<span class="pill">${escapeHtml(row.key)}</span>`).join(" ") || "None"}</div></div>
  ${failedRows.length > 0 ? `<h2>Failures (${failedRows.length})</h2>${failedRows.map(failedCard).join("")}` : ""}
</main>
</body>
</html>
`;
}

function metric(label: string, value: number) {
  return `<div class="metric"><b>${value}</b><span>${escapeHtml(label)}</span></div>`;
}

function siteCard(row: ChecklistComparisonRow) {
  const mismatches = row.sharedScanDetailMismatchRows ?? [];
  return `<section class="site">
    <div class="site-header">
      <div>
        <h3>${escapeHtml(row.key)}</h3>
        <div class="site-url">${escapeHtml(row.url)}</div>
      </div>
      <div>
        <span class="pill">${row.acceptedProductionSignalCount ?? 0} accepted</span>
        <span class="pill">${row.diagnosticCandidateCount ?? 0} candidates</span>
        <span class="pill">${row.rejectedCandidateCount ?? 0} rejected</span>
        ${mismatches.length > 0 ? `<span class="pill warning">${mismatches.length} SharedScanDetail mismatches</span>` : ""}
      </div>
    </div>
    <div class="site-body">
      <table>
        <thead><tr><th>Checklist row</th><th>Default</th><th>Opt-in</th></tr></thead>
        <tbody>${(row.changedRows ?? []).map((change) => `<tr>
          <td><code>${escapeHtml(change.rowId)}</code></td>
          <td>${status(change.defaultStatus)}</td>
          <td>${status(change.optInStatus)}</td>
        </tr>`).join("")}</tbody>
      </table>
      <div class="evidence">
        ${(row.acceptedEvidence ?? []).map((evidence) => `<div class="evidence-row">
          <div class="evidence-meta"><code>${escapeHtml(evidence.rowId)}</code> ${escapeHtml(evidence.locale ?? "locale_unknown")} ${escapeHtml(evidence.matchStrength ?? "strength_unknown")} term: <code>${escapeHtml(evidence.matchedTerm ?? "")}</code></div>
          <div class="excerpt">${escapeHtml(evidence.excerpt ?? "")}</div>
          ${evidence.sourceUrl ? `<div class="site-url">${escapeHtml(evidence.sourceUrl)}</div>` : ""}
        </div>`).join("")}
      </div>
    </div>
  </section>`;
}

function failedCard(row: ChecklistComparisonRow) {
  return `<section class="site"><div class="site-header"><h3>${escapeHtml(row.key)}</h3></div><div class="site-body">${escapeHtml(row.error ?? row.status)}</div></section>`;
}

function status(value: string) {
  const className =
    value === "Observed" ? "status-observed" :
    value === "Review signal" ? "status-review" :
    "status-muted";
  return `<span class="${className}">${escapeHtml(value)}</span>`;
}

async function bundleTargets(artifactRoot: string) {
  const resolvedRoot = path.resolve(artifactRoot);
  const mirrorRoot = path.join(
    process.cwd(),
    "artifacts/local-v2-dag-scans/__multilingual_local_checklist_compare__",
    `${path.basename(resolvedRoot)}-${shortHash(resolvedRoot)}`,
  );
  const entries = await readDirectory(resolvedRoot);
  const targetEntries = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const artifactDir = path.join(resolvedRoot, entry.name);
      return {
        artifactDir,
        bundlePath: path.join(artifactDir, "CanonicalEvidenceBundle.json"),
        key: entry.name,
        mirroredArtifactDir: path.join(mirrorRoot, entry.name),
      };
    })
    .filter((target) => existsSync(target.bundlePath))
    .sort((left, right) => left.key.localeCompare(right.key));
  return {
    entries: targetEntries,
    mirrorRoot,
  };
}

async function ensureArtifactMirror(sourceDir: string, mirrorDir: string) {
  if (path.resolve(sourceDir) === path.resolve(mirrorDir)) {
    return;
  }
  await mkdir(path.dirname(mirrorDir), { recursive: true });
  try {
    const stats = lstatSync(mirrorDir);
    if (stats.isSymbolicLink() && path.resolve(readlinkSync(mirrorDir)) === path.resolve(sourceDir)) {
      return;
    }
    await rm(mirrorDir, { recursive: true, force: true });
  } catch {
    // Missing mirror is the normal first-run path.
  }
  await symlink(sourceDir, mirrorDir, "dir");
}

function remapArtifactPaths(value: unknown, sourceDir: string, mirrorDir: string): unknown {
  if (typeof value === "string") {
    const absoluteSourceDir = path.resolve(sourceDir);
    const absoluteMirrorDir = path.resolve(mirrorDir);
    if (value === absoluteSourceDir || value.startsWith(`${absoluteSourceDir}${path.sep}`)) {
      return `${absoluteMirrorDir}${value.slice(absoluteSourceDir.length)}`;
    }

    const relativeSourceDir = path.relative(process.cwd(), absoluteSourceDir);
    const relativeMirrorDir = path.relative(process.cwd(), absoluteMirrorDir);
    if (relativeSourceDir && (value === relativeSourceDir || value.startsWith(`${relativeSourceDir}${path.sep}`))) {
      return `${relativeMirrorDir}${value.slice(relativeSourceDir.length)}`;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => remapArtifactPaths(item, sourceDir, mirrorDir));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      remapArtifactPaths(item, sourceDir, mirrorDir),
    ]));
  }

  return value;
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

async function readDirectory(dir: string) {
  const { readdir } = await import("node:fs/promises");
  return readdir(dir, { withFileTypes: true });
}

async function loadLocalV2DagReport(): Promise<LocalV2DagReportExports> {
  const require = createRequire(import.meta.url);
  const Module = require("node:module") as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = Module._load;
  Module._load = function loadWithServerOnlyShim(request: string, parent: unknown, isMain: boolean) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const mod = await import("../apps/web/server/scans/local-v2-dag-report.ts");
    const exports = (mod.default ?? mod) as Partial<LocalV2DagReportExports>;
    if (typeof exports.dedupePolicySurfaces !== "function" || typeof exports.summarizePolicySurfaces !== "function") {
      throw new Error("local-v2-dag-report exports were not available for local comparison.");
    }
    return {
      dedupePolicySurfaces: exports.dedupePolicySurfaces,
      summarizePolicySurfaces: exports.summarizePolicySurfaces,
    };
  } finally {
    Module._load = originalLoad;
  }
}

async function loadSharedScanDetail(): Promise<SharedScanDetailExports> {
  const mod = await import("../apps/web/components/scans/shared-scan-detail-view");
  const exports = (mod.default ?? mod) as Partial<SharedScanDetailExports>;
  if (typeof exports.deriveSharedScanDetailGdprEprivacyCoverageChecklist !== "function") {
    throw new Error("shared-scan-detail-view export missing deriveSharedScanDetailGdprEprivacyCoverageChecklist.");
  }
  return {
    deriveSharedScanDetailGdprEprivacyCoverageChecklist: exports.deriveSharedScanDetailGdprEprivacyCoverageChecklist,
  };
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    artifactRoot: "artifacts/local-no-lambda-multilingual-news21-current-20260703",
    outDir: "artifacts/local-no-lambda-multilingual-news21-current-20260703/checklist-comparison",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else if (arg === "--artifact-root") {
      args.artifactRoot = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--") {
      continue;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  args.artifactRoot = path.resolve(args.artifactRoot);
  args.outDir = path.resolve(args.outDir);
  return args;
}

function printUsage() {
  console.log([
    "Usage: pnpm v2:multilingual-local-checklist-compare -- [options]",
    "",
    "Compares legacy_only and explicit multilingual Article 13 checklist outcomes from local no-Lambda artifacts.",
    "",
    "Options:",
    "  --artifact-root <path>  Directory containing per-site CanonicalEvidenceBundle.json files",
    "  --out-dir <path>        Output directory for comparison summaries",
  ].join("\n"));
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((record) => Object.keys(record).length > 0) : [];
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function hostnameFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function formatCountRecord(value: Record<string, number> | undefined) {
  return Object.entries(value ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}:${count}`)
    .join(",");
}

function truncate(value: string | undefined, maxLength: number) {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}...`;
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tsvCell(value: unknown) {
  return String(value).replace(/\t/g, " ").replace(/\r?\n/g, " ").slice(0, 1_000);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
