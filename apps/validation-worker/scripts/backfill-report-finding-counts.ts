import { query, queryOne } from "@website-signal-risk-scanner/db";
import {
  getPrimaryCategoryDescription,
  getPrimaryCategoryLabel,
  mapSignalKeyToTaxonomy
} from "@website-signal-risk-scanner/shared";
import { buildNanoPolicyInputsFromDocumentSources, shouldPreferNanoDocumentSources } from "../../web/lib/scans/nano-document-sources";
import { buildScanReportUnifiedFindingsForScan } from "../../web/lib/scans/scan-report-unified-findings";
import { repairFindingFamilyPacketEvents } from "../../web/server/scans/family-packet-event-repair";
import type { ScanValidationFinding } from "../../web/lib/scans/validation-review-linking";

type ScanCandidateRow = {
  completed_at: string | null;
  id: string;
};

type ValidationRunRow = {
  created_at: string;
  id: string;
  scan_id: string;
};

type ValidationFindingWithVerdictRow = {
  category: string | null;
  description: string | null;
  evidence_json: Record<string, unknown> | null;
  finding_family: string | null;
  finding_scope: string | null;
  finding_source: string | null;
  finding_subject: string | null;
  id: string;
  page_url: string | null;
  rule_key: string;
  severity: string | null;
  subtype: string | null;
  title: string;
  validation_verdicts:
    | {
        agreement_score: number | null;
        confidence: number | null;
        model: string | null;
        prompt_version: string | null;
        rationale: string | null;
        system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
        system_confidence_explanation: string | null;
        system_confidence_score: number | null;
        verdict: "supported" | "inconclusive" | "not_supported" | null;
      }
    | Array<{
        agreement_score: number | null;
        confidence: number | null;
        model: string | null;
        prompt_version: string | null;
        rationale: string | null;
        system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
        system_confidence_explanation: string | null;
        system_confidence_score: number | null;
        verdict: "supported" | "inconclusive" | "not_supported" | null;
      }>
    | null;
};

type ValidationVerdictRow = {
  agreement_score: number | null;
  confidence: number | null;
  model: string | null;
  prompt_version: string | null;
  rationale: string | null;
  system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
  system_confidence_explanation: string | null;
  system_confidence_score: number | null;
  validation_run_finding_id: string;
  verdict: "supported" | "inconclusive" | "not_supported" | null;
};

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function loadScanRecordForFindingCount(input: {
  runId: string | null;
  scanId: string;
}) {
  const [
    snapshot,
    runtimeArtifacts,
    preconsentViolations,
    trackerVendors,
    accessibilityRuleCounts,
    accessibilityRuleExamples,
    policyEnrichment,
    documentSources,
    policyReviewQueue,
    signals,
    events,
    validationFindingRows
  ] = await Promise.all([
    queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [input.scanId], { readOnly: true }),
    queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [input.scanId], { readOnly: true }),
    query<Record<string, unknown>>(`select * from scan_preconsent_violations where scan_id = $1`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_tracker_vendors where scan_id = $1`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_accessibility_rule_counts where scan_id = $1`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_accessibility_rule_examples where scan_id = $1`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from policy_enrichment where scan_id = $1 order by created_at asc`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from scan_document_sources where scan_id = $1 order by created_at asc`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from policy_review_queue where scan_id = $1 order by created_at asc`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select category, signal_key, signal_label, signal_value_json, value_type, population_source
         from scan_signals
        where scan_id = $1`,
      [input.scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select id, event_type, message, metadata_json, created_at
         from scan_events
        where scan_id = $1
        order by created_at asc`,
      [input.scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    input.runId
      ? query<ValidationFindingWithVerdictRow>(
          `select id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json
             from validation_run_findings
            where validation_run_id = $1`,
          [input.runId],
          { readOnly: true }
        ).then((result) => result.rows)
      : Promise.resolve([] as ValidationFindingWithVerdictRow[])
  ]);

  const validationFindingBaseRows = validationFindingRows;
  const validationFindingIds = validationFindingBaseRows.map((row) => row.id);
  const verdictByFindingId = new Map<string, ValidationVerdictRow>();

  if (validationFindingIds.length > 0) {
    const verdictRows = await query<ValidationVerdictRow>(
      `select validation_run_finding_id, verdict, confidence, rationale, agreement_score, model, prompt_version, system_confidence_score, system_confidence_band, system_confidence_explanation
         from validation_verdicts
        where validation_run_finding_id = any($1::uuid[])
        order by created_at desc`,
      [validationFindingIds],
      { readOnly: true }
    ).then((result) => result.rows);

    for (const row of verdictRows) {
      if (!verdictByFindingId.has(row.validation_run_finding_id)) {
        verdictByFindingId.set(row.validation_run_finding_id, row);
      }
    }
  }

  const normalizedSignals = ((signals ?? []) as Array<Record<string, unknown>>)
    .filter((signal) => !signal.population_source || signal.population_source === "scanner")
    .map((signal) => {
    const category = String(signal.category ?? "");
    const key = String(signal.signal_key ?? "");
    const label = String(signal.signal_label ?? key);
    const taxonomy = mapSignalKeyToTaxonomy({
      category,
      key,
      label
    });

      return {
        category,
        key,
        label,
        primaryCategory: taxonomy.primaryCategory,
        primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
        primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
        subcategory: taxonomy.subcategory ?? null,
        value: signal.signal_value_json,
        valueType: String(signal.value_type ?? "unknown")
      };
    });

  const normalizedDocumentSources = (documentSources ?? []) as Array<Record<string, unknown>>;
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources);
  const policySemanticRows = preferDocumentSources
    ? buildNanoPolicyInputsFromDocumentSources(normalizedDocumentSources)
    : ((policyEnrichment ?? []) as Array<Record<string, unknown>>);
  const normalizedPolicyEnrichment = policySemanticRows.map((row, index) => {
    const next = { ...row };
    if (typeof next.id !== "string") {
      next.id = typeof row.source_document_id === "string" ? row.source_document_id : `document-semantic-${index + 1}`;
    }
    delete next.created_at;
    delete next.updated_at;
    return next;
  });
  const repairedEvents = repairFindingFamilyPacketEvents({
    events: ((events ?? []) as Array<Record<string, unknown>>).map((event) => ({
      id: String(event.id ?? ""),
      eventType: String(event.event_type ?? ""),
      message: typeof event.message === "string" ? event.message : "",
      metadataJson: (event.metadata_json as Record<string, unknown> | null) ?? undefined,
      createdAt: String(event.created_at ?? "")
    })),
    policyEnrichment: normalizedPolicyEnrichment
  });

  const mappedValidationFindings: ScanValidationFinding[] = validationFindingBaseRows.map((row) => {
    const latestVerdict = verdictByFindingId.get(row.id) ?? null;
    const verdictRows = Array.isArray(row.validation_verdicts)
      ? row.validation_verdicts
      : latestVerdict
        ? [latestVerdict]
        : [];
    const verdict = verdictRows[0];

    return {
      agreementScore: verdict?.agreement_score ?? null,
      category: row.category,
      description: row.description,
      evidence: row.evidence_json ?? null,
      findingFamily: row.finding_family,
      findingScope: row.finding_scope,
      findingSource: row.finding_source,
      findingSubject: row.finding_subject,
      id: row.id,
      model: verdict?.model ?? null,
      modelConfidence: verdict?.confidence ?? null,
      pageUrl: row.page_url,
      promptVersion: verdict?.prompt_version ?? null,
      rationale: verdict?.rationale ?? null,
      ruleKey: row.rule_key,
      severity: row.severity,
      subtype: row.subtype,
      systemConfidenceBand: verdict?.system_confidence_band ?? null,
      systemConfidenceExplanation: verdict?.system_confidence_explanation ?? null,
      systemConfidenceScore: verdict?.system_confidence_score ?? null,
      title: row.title,
      verdict: verdict?.verdict ?? null
    };
  });

  return {
    accessibilityRuleCounts: accessibilityRuleCounts as Array<Record<string, unknown>>,
    accessibilityRuleExamples: accessibilityRuleExamples as Array<Record<string, unknown>>,
    events: repairedEvents,
    policyEnrichment: normalizedPolicyEnrichment,
    policyReviewQueue: (policyReviewQueue as Array<Record<string, unknown>>).map((row) => {
      const next = { ...row };
      delete next.created_at;
      delete next.updated_at;
      return next;
    }),
    preconsentViolations: preconsentViolations as Array<Record<string, unknown>>,
    runtimeArtifacts: (runtimeArtifacts as Record<string, unknown> | null) ?? null,
    signals: normalizedSignals,
    snapshot: (snapshot as Record<string, unknown> | null) ?? null,
    trackerVendors: trackerVendors as Array<Record<string, unknown>>,
    validationFindings: mappedValidationFindings
  };
}

async function computeReportFindingCount(scanRecord: Awaited<ReturnType<typeof loadScanRecordForFindingCount>>) {
  return buildScanReportUnifiedFindingsForScan(scanRecord).length;
}

async function main() {
  const limit = Number(getArgValue("--limit") ?? "200");
  const dryRun = hasFlag("--dry-run");
  const sinceDays = Number(getArgValue("--since-days") ?? "14");
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const candidateResult = await query<{
    completed_at: string | null;
    scan_id: string;
  }>(
    `
      select ss.scan_id, s.completed_at
      from scan_snapshots ss
      join scans s on s.id = ss.scan_id
      where ss.report_finding_count is null
        and ss.scan_id is not null
        and s.completed_at >= $1
      order by s.completed_at desc
      limit $2
    `,
    [sinceIso, limit],
    { readOnly: true }
  );

  const candidates = candidateResult.rows
    .map((row) => ({
      scanId: row.scan_id,
      scan: {
        completed_at: row.completed_at,
        id: row.scan_id
      } satisfies ScanCandidateRow
    }))
    .filter((row): row is { scanId: string; scan: ScanCandidateRow } => Boolean(row.scanId && row.scan.id));

  const scanIds = candidates.map((row) => row.scanId);
  const latestValidationRunByScanId = new Map<string, string | null>();
  for (const batch of chunkValues(scanIds, 50)) {
    const validationRuns = await query<ValidationRunRow>(
      `select id, scan_id, created_at
         from validation_runs
        where scan_id = any($1::uuid[])
        order by created_at desc`,
      [batch],
      { readOnly: true }
    ).then((result) => result.rows);

    for (const row of validationRuns) {
      if (!latestValidationRunByScanId.has(row.scan_id)) {
        latestValidationRunByScanId.set(row.scan_id, row.id);
      }
    }
  }

  let updated = 0;
  const failed: string[] = [];
  for (const candidate of candidates) {
    try {
      const runId = latestValidationRunByScanId.get(candidate.scanId) ?? null;
      const scanRecord = await loadScanRecordForFindingCount({
        runId,
        scanId: candidate.scanId
      });
      const count = await computeReportFindingCount(scanRecord);
      console.log(`${candidate.scanId} ${count}`);

      if (dryRun) {
        continue;
      }

      await query(
        `update scan_snapshots set report_finding_count = $2 where scan_id = $1`,
        [candidate.scanId, count]
      );

      updated += 1;
    } catch (error) {
      failed.push(candidate.scanId);
      console.error("[backfill-report-finding-counts] failed", {
        error: error instanceof Error ? error.message : String(error),
        scanId: candidate.scanId
      });
    }
  }

  console.log(JSON.stringify({ candidates: candidates.length, dryRun, failed, updated }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
