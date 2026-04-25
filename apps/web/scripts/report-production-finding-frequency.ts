import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { closePools, query, queryOne } from "@website-signal-risk-scanner/db";

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  error_message: string | null;
  id: string;
  organization_id: string | null;
  pages_requested: number;
  pages_scanned: number;
  scan_type: string;
  started_at: string | null;
  status: string;
};

type FrequencyEntry = {
  auditOnlyCount: number;
  auditOnlyScanCount: number;
  anyStatusScanCount: number;
  deltaScanCount?: number;
  deltaScanPct?: number;
  findingId: string;
  reviewCount: number;
  reviewScanCount: number;
  sampleSummary: string | null;
  scanCount: number;
  scanPct: number;
  suppressedCount: number;
  suppressedScanCount: number;
  surfaceCount: number;
};

type ProductionFindingFrequencyReport = {
  generatedAt: string;
  scope: {
    completedFrom: string | null;
    completedTo: string | null;
    distinctDomains: number;
    distinctOrganizations: number;
    scanCount: number;
    scanType: string;
  };
  statusCounts: {
    auditOnly: number;
    review: number;
    suppressed: number;
    surface: number;
    totalOwnerFindings: number;
  };
  topFindings: FrequencyEntry[];
};

type ModuleRecord = Record<string, unknown>;

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

function stripDbRecord(record: Record<string, unknown> | null | undefined) {
  if (!record) {
    return null;
  }

  const next = { ...record };
  delete next.id;
  delete next.created_at;
  delete next.updated_at;
  return next;
}

function normalizeDateString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function normalizeSignalValueType(row: Record<string, unknown>) {
  const valueType = row.value_type;
  const value = row.signal_value_json;
  if (valueType === "boolean" || valueType === "number" || valueType === "text" || valueType === "string_array") {
    return valueType;
  }
  if (Array.isArray(value)) {
    return "string_array";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  return "text";
}

function normalizePopulation(input: {
  observedAt: string | null;
  row: Record<string, unknown>;
  source: "nano" | "scanner" | "validation";
}) {
  const key = String(input.row.signal_key ?? "");
  const populationStatus =
    input.row.population_status === "present" ||
    input.row.population_status === "missing" ||
    input.row.population_status === "conflicting" ||
    input.row.population_status === "insufficient"
      ? input.row.population_status
      : "present";

  return {
    confidence: typeof input.row.confidence === "number" ? input.row.confidence : null,
    evidenceRefs: Array.isArray(input.row.evidence_refs)
      ? input.row.evidence_refs.filter((value): value is string => typeof value === "string")
      : [],
    key,
    label: String(input.row.signal_label ?? key),
    observedAt: typeof input.row.observed_at === "string" ? input.row.observed_at : input.observedAt,
    populationStatus,
    provenance: Array.isArray(input.row.provenance_json) ? input.row.provenance_json : [],
    reportSignalSource:
      input.source === "scanner"
        ? key.startsWith("privacy.") ||
          key.startsWith("commerce.") ||
          key.startsWith("financial.") ||
          key.startsWith("entity.") ||
          key.startsWith("disclosure.") ||
          key.startsWith("context.") ||
          key.startsWith("accessibility.")
          ? "snapshot_signal"
          : null
        : "document_semantic_signal",
    source: input.source,
    value: input.row.signal_value_json,
    valueType: normalizeSignalValueType(input.row)
  };
}

async function loadRows(sql: string, params: unknown[]) {
  return query<Record<string, unknown>>(sql, params, { readOnly: true }).then((result) => result.rows);
}

async function loadScanRecord(input: {
  buildMergedSignalRecords: (input: Record<string, unknown>) => unknown[];
  getHybridDerivedTrackerVendors: (runtimeArtifacts: Record<string, unknown> | null) => Array<Record<string, unknown>>;
  getPrimaryCategoryDescription: (category: string) => string;
  getPrimaryCategoryLabel: (category: string) => string;
  getPrimaryPolicyEnrichmentRow: (rows: Array<Record<string, unknown>>) => Record<string, unknown> | null;
  mapSignalKeyToTaxonomy: (input: { category: string; key: string; label: string }) => { primaryCategory: string; subcategory?: string | null };
  scan: ScanRow;
  withHybridRuntimeArtifactFallbacks: (runtimeArtifacts: Record<string, unknown>) => Record<string, unknown> | null;
}) {
  const [
    snapshot,
    runtimeArtifactsRow,
    signalRows,
    policyRows,
    eventRows,
    preconsentRows,
    trackerRows,
    accessibilityRuleCounts,
    accessibilityRuleExamples,
    policyReviewRows,
    validationRun
  ] = await Promise.all([
    queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [input.scan.id], { readOnly: true }),
    queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [input.scan.id], { readOnly: true }),
    loadRows(
      `select category, signal_key, signal_label, signal_value_json, value_type, population_source, population_status, confidence, evidence_refs, provenance_json, observed_at
         from scan_signals
        where scan_id = $1`,
      [input.scan.id]
    ),
    loadRows(`select * from policy_enrichment where scan_id = $1 order by created_at asc`, [input.scan.id]).then((rows) =>
      rows.map(stripDbRecord).filter((row): row is Record<string, unknown> => Boolean(row))
    ),
    loadRows(`select id, event_type, message, metadata_json, created_at from scan_events where scan_id = $1 order by created_at asc`, [input.scan.id]).then((rows) =>
      rows.map((event) => ({
        createdAt: String(event.created_at ?? ""),
        eventType: String(event.event_type ?? ""),
        id: String(event.id ?? ""),
        message: typeof event.message === "string" ? event.message : "",
        metadataJson: event.metadata_json
      }))
    ),
    loadRows(
      `select vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, script_host, matched_signature_id, evidence_urls
         from scan_preconsent_violations
        where scan_id = $1`,
      [input.scan.id]
    ).then((rows) =>
      rows.map((row) => ({
        collectionEndpointType: row.collection_endpoint_type ?? "unknown",
        confidence: Number(row.confidence ?? 0),
        detectionSource: row.detection_source,
        evidenceUrls: Array.isArray(row.evidence_urls) ? row.evidence_urls : [],
        firstPartyOrThirdParty: row.first_party_or_third_party,
        matchedSignatureId: row.matched_signature_id ?? null,
        scriptHost: row.script_host ?? null,
        vendorCategory: row.vendor_category,
        vendorName: row.vendor_name
      }))
    ),
    loadRows(
      `select vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, before_consent, script_host, matched_signature_id
         from scan_tracker_vendors
        where scan_id = $1`,
      [input.scan.id]
    ).then((rows) =>
      rows.map((row) => ({
        beforeConsent: typeof row.before_consent === "boolean" ? row.before_consent : null,
        collectionEndpointType: row.collection_endpoint_type ?? "unknown",
        confidence: Number(row.confidence ?? 0),
        detectionSource: row.detection_source,
        firstPartyOrThirdParty: row.first_party_or_third_party,
        matchedSignatureId: row.matched_signature_id ?? null,
        scriptHost: row.script_host ?? null,
        vendorCategory: row.vendor_category,
        vendorName: row.vendor_name
      }))
    ),
    loadRows(`select rule_code, rule_group, severity, instance_count from scan_accessibility_rule_counts where scan_id = $1`, [input.scan.id]).then((rows) =>
      rows.map((row) => ({
        instanceCount: Number(row.instance_count ?? 0),
        ruleCode: row.rule_code,
        ruleGroup: row.rule_group,
        severity: row.severity
      }))
    ),
    loadRows(
      `select page_url, rule_code, rule_group, severity, impact, help, help_url, description, node_count, representative_selectors
         from scan_accessibility_rule_examples
        where scan_id = $1`,
      [input.scan.id]
    ).then((rows) =>
      rows.map((row) => ({
        description: row.description,
        help: row.help,
        helpUrl: row.help_url,
        impact: row.impact,
        nodeCount: Number(row.node_count ?? 0),
        pageUrl: row.page_url,
        representativeSelectors: Array.isArray(row.representative_selectors) ? row.representative_selectors : [],
        ruleCode: row.rule_code,
        ruleGroup: row.rule_group,
        severity: row.severity
      }))
    ),
    loadRows(`select * from policy_review_queue where scan_id = $1 order by created_at asc`, [input.scan.id]).then((rows) =>
      rows.map(stripDbRecord).filter((row): row is Record<string, unknown> => Boolean(row))
    ),
    queryOne<{ id: string }>(`select id from validation_runs where scan_id = $1 order by created_at desc limit 1`, [input.scan.id], { readOnly: true })
  ]);

  let validationFindings: Array<Record<string, unknown>> = [];
  if (validationRun?.id) {
    const validationRows = await loadRows(
      `select id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json
         from validation_run_findings
        where validation_run_id = $1
        order by finding_rank asc`,
      [validationRun.id]
    );
    validationFindings = validationRows.map((row) => ({
      agreementScore: null,
      category: row.category,
      description: row.description,
      evidence: row.evidence_json ?? null,
      findingFamily: row.finding_family,
      findingScope: row.finding_scope,
      findingSource: row.finding_source,
      findingSubject: row.finding_subject,
      id: row.id,
      model: null,
      modelConfidence: null,
      pageUrl: row.page_url,
      promptVersion: null,
      rationale: null,
      ruleKey: row.rule_key,
      severity: row.severity,
      subtype: row.subtype,
      systemConfidenceBand: null,
      systemConfidenceExplanation: null,
      systemConfidenceScore: null,
      title: row.title,
      verdict: null
    }));
  }

  const observedAt = input.scan.completed_at ?? input.scan.started_at ?? input.scan.created_at;
  const scannerSignalRows = signalRows.filter((row) => !row.population_source || row.population_source === "scanner");
  const nanoSignalRows = signalRows.filter((row) => row.population_source === "nano");
  const validationSignalRows = signalRows.filter((row) => row.population_source === "validation");
  const runtimeArtifacts = runtimeArtifactsRow
    ? input.withHybridRuntimeArtifactFallbacks(stripDbRecord(runtimeArtifactsRow) ?? runtimeArtifactsRow) ?? stripDbRecord(runtimeArtifactsRow)
    : null;
  const runtimeTrackerRows = input.getHybridDerivedTrackerVendors(runtimeArtifacts).map((tracker) => ({
    beforeConsent: tracker.beforeConsent,
    collectionEndpointType: tracker.collectionEndpointType,
    confidence: tracker.confidence,
    detectionSource: tracker.detectionSource,
    firstPartyOrThirdParty: tracker.firstPartyOrThirdParty,
    matchedSignatureId: tracker.matchedSignatureId,
    scriptHost: tracker.scriptHost,
    vendorCategory: tracker.vendorCategory,
    vendorName: tracker.vendorName
  }));

  return {
    accessibilityRuleCounts,
    accessibilityRuleExamples,
    events: eventRows,
    mergedSignals: input.buildMergedSignalRecords({
      nanoSignals: nanoSignalRows.map((row) => normalizePopulation({ observedAt, row, source: "nano" })),
      scannerSignals: scannerSignalRows.map((row) => normalizePopulation({ observedAt, row, source: "scanner" })),
      validationSignals: validationSignalRows.map((row) => normalizePopulation({ observedAt, row, source: "validation" }))
    }),
    policyEnrichment: policyRows,
    policyReviewQueue: policyReviewRows,
    preconsentViolations: preconsentRows,
    primaryPolicyEnrichment: input.getPrimaryPolicyEnrichmentRow(policyRows),
    runtimeArtifacts,
    scan: {
      completedAt: input.scan.completed_at,
      createdAt: input.scan.created_at,
      errorMessage: input.scan.error_message,
      id: input.scan.id,
      pagesRequested: input.scan.pages_requested,
      pagesScanned: input.scan.pages_scanned,
      scanType: input.scan.scan_type,
      startedAt: input.scan.started_at,
      status: input.scan.status
    },
    signals: scannerSignalRows.map((row) => {
      const category = String(row.category ?? "");
      const key = String(row.signal_key ?? "");
      const label = String(row.signal_label ?? key);
      const taxonomy = input.mapSignalKeyToTaxonomy({ category, key, label });
      return {
        category,
        key,
        label,
        primaryCategory: taxonomy.primaryCategory,
        primaryCategoryDescription: input.getPrimaryCategoryDescription(taxonomy.primaryCategory),
        primaryCategoryLabel: input.getPrimaryCategoryLabel(taxonomy.primaryCategory),
        subcategory: taxonomy.subcategory ?? null,
        value: row.signal_value_json,
        valueType: normalizeSignalValueType(row)
      };
    }),
    snapshot: stripDbRecord(snapshot),
    trackerVendors: [...trackerRows, ...runtimeTrackerRows],
    validationFindings
  };
}

function loadBaseline(path: string | null) {
  if (!path) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as ProductionFindingFrequencyReport;
  return new Map(parsed.topFindings.map((entry) => [entry.findingId, entry]));
}

export function applyBaselineDeltas(report: ProductionFindingFrequencyReport, baselinePath: string | null) {
  const baseline = loadBaseline(baselinePath);
  if (!baseline) {
    return report;
  }

  return {
    ...report,
    topFindings: report.topFindings.map((entry) => {
      const previous = baseline.get(entry.findingId);
      if (!previous) {
        return entry;
      }
      return {
        ...entry,
        deltaScanCount: entry.scanCount - previous.scanCount,
        deltaScanPct: Number((entry.scanPct - previous.scanPct).toFixed(1))
      };
    })
  };
}

function renderMarkdown(report: ProductionFindingFrequencyReport) {
  const lines = [
    "# Production Finding Frequency",
    "",
    `Generated: ${report.generatedAt}`,
    `Scope: ${report.scope.scanCount} completed org-backed ${report.scope.scanType} scans across ${report.scope.distinctDomains} domains and ${report.scope.distinctOrganizations} orgs`,
    `Window: ${report.scope.completedFrom ?? "unknown"} to ${report.scope.completedTo ?? "unknown"}`,
    "",
    `Surface findings: ${report.statusCounts.surface}`,
    `Audit-only findings: ${report.statusCounts.auditOnly}`,
    `Suppressed findings: ${report.statusCounts.suppressed}`,
    `Review findings: ${report.statusCounts.review}`,
    "",
    "| Rank | Finding | Surface scans | Frequency | Surface | Audit-only scans | Suppressed scans | Review scans | Any-status scans | Delta |",
    "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|"
  ];

  report.topFindings.forEach((entry, index) => {
    const delta = entry.deltaScanCount === undefined ? "" : `${entry.deltaScanCount >= 0 ? "+" : ""}${entry.deltaScanCount} / ${entry.deltaScanPct ?? 0}%`;
    lines.push(
      `| ${index + 1} | \`${entry.findingId}\` | ${entry.scanCount} | ${entry.scanPct.toFixed(1)}% | ${entry.surfaceCount} | ${entry.auditOnlyScanCount} | ${entry.suppressedScanCount} | ${entry.reviewScanCount} | ${entry.anyStatusScanCount} | ${delta} |`
    );
  });

  return `${lines.join("\n")}\n`;
}

export async function buildProductionFindingFrequencyReport(input?: {
  baselinePath?: string | null;
  includeNonSurface?: boolean;
  limit?: number;
  scanType?: string;
}) {
  const limit = input?.limit ?? 25;
  const scanType = input?.scanType ?? "full";
  const baselinePath = input?.baselinePath ?? null;
  const includeNonSurface = input?.includeNonSurface === true;
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
  const component = getDefaultExport<ModuleRecord>(componentModule as ModuleRecord);
  const taxonomy = getDefaultExport<ModuleRecord>(taxonomyModule as ModuleRecord);
  const mergedSignals = getDefaultExport<ModuleRecord>(mergedSignalsModule as ModuleRecord);
  const hybridRuntime = getDefaultExport<ModuleRecord>(hybridRuntimeModule as ModuleRecord);
  const policyEnrichment = getDefaultExport<ModuleRecord>(policyEnrichmentModule as ModuleRecord);
  const buildScanReportUnifiedFindings = component.buildScanReportUnifiedFindings as (record: Record<string, unknown>) => Array<Record<string, unknown>>;

  if (typeof buildScanReportUnifiedFindings !== "function") {
    throw new Error("Could not resolve buildScanReportUnifiedFindings from shared scan detail view.");
  }

  const scans = await query<ScanRow>(
    `select id, organization_id, domain_id, scan_type, status, created_at, started_at, completed_at, pages_requested, pages_scanned, error_message
       from scans
      where status = 'completed'
        and scan_type = $1
        and organization_id is not null
      order by completed_at asc nulls last`,
    [scanType],
    { readOnly: true }
  ).then((result) => result.rows);
  const findingCounts = new Map<string, {
    auditOnlyCount: number;
    auditOnlyScanIds: Set<string>;
    reviewScanIds: Set<string>;
    reviewCount: number;
    sampleSummary: string | null;
    scanIds: Set<string>;
    suppressedScanIds: Set<string>;
    suppressedCount: number;
    surfaceScanIds: Set<string>;
    surfaceCount: number;
  }>();
  let totalOwnerFindings = 0;
  let totalSurface = 0;
  let totalAuditOnly = 0;
  let totalReview = 0;
  let totalSuppressed = 0;

  for (const scan of scans) {
    const record = await loadScanRecord({
      buildMergedSignalRecords: mergedSignals.buildMergedSignalRecords as (input: Record<string, unknown>) => unknown[],
      getHybridDerivedTrackerVendors: hybridRuntime.getHybridDerivedTrackerVendors as (runtimeArtifacts: Record<string, unknown> | null) => Array<Record<string, unknown>>,
      getPrimaryCategoryDescription: taxonomy.getPrimaryCategoryDescription as (category: string) => string,
      getPrimaryCategoryLabel: taxonomy.getPrimaryCategoryLabel as (category: string) => string,
      getPrimaryPolicyEnrichmentRow: policyEnrichment.getPrimaryPolicyEnrichmentRow as (rows: Array<Record<string, unknown>>) => Record<string, unknown> | null,
      mapSignalKeyToTaxonomy: taxonomy.mapSignalKeyToTaxonomy as (input: { category: string; key: string; label: string }) => { primaryCategory: string; subcategory?: string | null },
      scan,
      withHybridRuntimeArtifactFallbacks: hybridRuntime.withHybridRuntimeArtifactFallbacks as (runtimeArtifacts: Record<string, unknown>) => Record<string, unknown> | null
    });
    const findings = buildScanReportUnifiedFindings(record);
    totalOwnerFindings += findings.length;

    for (const finding of findings) {
      const findingId = String(finding.unifiedFindingId ?? "");
      if (!findingId) {
        continue;
      }
      const presentationDecision = finding.presentationDecision as { status?: string } | undefined;
      const status = presentationDecision?.status ?? "unknown";
      if (status !== "surface" && status !== "audit_only" && status !== "review" && status !== "suppress") {
        continue;
      }

      if (status === "surface") {
        totalSurface += 1;
      } else if (status === "audit_only") {
        totalAuditOnly += 1;
      } else if (status === "review") {
        totalReview += 1;
      } else {
        totalSuppressed += 1;
      }

      const current = findingCounts.get(findingId) ?? {
        auditOnlyCount: 0,
        auditOnlyScanIds: new Set<string>(),
        reviewScanIds: new Set<string>(),
        reviewCount: 0,
        sampleSummary: null,
        scanIds: new Set<string>(),
        suppressedScanIds: new Set<string>(),
        suppressedCount: 0,
        surfaceScanIds: new Set<string>(),
        surfaceCount: 0
      };
      current.scanIds.add(scan.id);
      current.sampleSummary = current.sampleSummary ?? (typeof finding.summary === "string" ? finding.summary : null);
      if (status === "surface") {
        current.surfaceCount += 1;
        current.surfaceScanIds.add(scan.id);
      } else if (status === "audit_only") {
        current.auditOnlyCount += 1;
        current.auditOnlyScanIds.add(scan.id);
      } else if (status === "review") {
        current.reviewCount += 1;
        current.reviewScanIds.add(scan.id);
      } else {
        current.suppressedCount += 1;
        current.suppressedScanIds.add(scan.id);
      }
      findingCounts.set(findingId, current);
    }
  }

  const completedTimes = scans.map((scan) => normalizeDateString(scan.completed_at)).filter((value): value is string => typeof value === "string");
  const distinctDomains = new Set(scans.map((scan) => scan.domain_id).filter(Boolean)).size;
  const distinctOrganizations = new Set(scans.map((scan) => scan.organization_id).filter(Boolean)).size;
  const topFindings = [...findingCounts.entries()]
    .map(([findingId, entry]) => ({
      auditOnlyCount: entry.auditOnlyCount,
      auditOnlyScanCount: entry.auditOnlyScanIds.size,
      anyStatusScanCount: entry.scanIds.size,
      findingId,
      reviewCount: entry.reviewCount,
      reviewScanCount: entry.reviewScanIds.size,
      sampleSummary: entry.sampleSummary,
      scanCount: entry.surfaceScanIds.size,
      scanPct: scans.length > 0 ? Number(((entry.surfaceScanIds.size / scans.length) * 100).toFixed(1)) : 0,
      suppressedCount: entry.suppressedCount,
      suppressedScanCount: entry.suppressedScanIds.size,
      surfaceCount: entry.surfaceCount
    }))
    .filter((entry) => (includeNonSurface ? entry.anyStatusScanCount > 0 : entry.surfaceCount > 0))
    .sort((left, right) => {
      const leftPrimary = includeNonSurface ? left.anyStatusScanCount : left.scanCount;
      const rightPrimary = includeNonSurface ? right.anyStatusScanCount : right.scanCount;
      return rightPrimary - leftPrimary || right.surfaceCount - left.surfaceCount || left.findingId.localeCompare(right.findingId);
    })
    .slice(0, limit);

  return applyBaselineDeltas({
    generatedAt: new Date().toISOString(),
    scope: {
      completedFrom: completedTimes[0] ?? null,
      completedTo: completedTimes[completedTimes.length - 1] ?? null,
      distinctDomains,
      distinctOrganizations,
      scanCount: scans.length,
      scanType
    },
    statusCounts: {
      auditOnly: totalAuditOnly,
      review: totalReview,
      suppressed: totalSuppressed,
      surface: totalSurface,
      totalOwnerFindings
    },
    topFindings
  }, baselinePath);
}

async function buildReport() {
  const limit = getNumberArg("--limit", 25);
  const scanType = getArgValue("--scan-type") ?? "full";
  const baselinePath = getArgValue("--baseline");
  const outputPath = getArgValue("--out");
  const report = await buildProductionFindingFrequencyReport({ baselinePath, limit, scanType });

  const output = hasFlag("--json") ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);
  if (outputPath) {
    writeFileSync(outputPath, output, "utf8");
  }
  process.stdout.write(output);
}

if (require.main === module) {
  buildReport()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePools();
    });
}
