import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  getPrimaryCategoryDescription,
  getPrimaryCategoryLabel,
  mapSignalKeyToTaxonomy
} from "@website-signal-risk-scanner/shared";
import { buildUnifiedFindingDisplayPackets } from "../../web/lib/scans/unified-findings";
import { repairFindingFamilyPacketEvents } from "../../web/server/scans/family-packet-event-repair";
import type { ScanValidationFinding } from "../../web/lib/scans/validation-review-linking";

type ScanCandidateRow = {
  completed_at: string | null;
  id: string;
};

type ValidationRunRow = {
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
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const [
    { data: snapshot, error: snapshotError },
    { data: runtimeArtifacts, error: runtimeArtifactsError },
    { data: preconsentViolations, error: preconsentError },
    { data: trackerVendors, error: trackerError },
    { data: accessibilityRuleCounts, error: accessibilityRuleCountsError },
    { data: accessibilityRuleExamples, error: accessibilityRuleExamplesError },
    { data: policyEnrichment, error: policyEnrichmentError },
    { data: policyReviewQueue, error: policyReviewQueueError },
    { data: signals, error: signalsError },
    { data: events, error: eventsError },
    { data: validationFindingRows, error: validationFindingsError }
  ] = await Promise.all([
    input.supabase.from("scan_snapshots").select("*").eq("scan_id", input.scanId).maybeSingle(),
    input.supabase.from("scan_runtime_artifacts").select("*").eq("scan_id", input.scanId).maybeSingle(),
    input.supabase.from("scan_preconsent_violations").select("*").eq("scan_id", input.scanId),
    input.supabase.from("scan_tracker_vendors").select("*").eq("scan_id", input.scanId),
    input.supabase.from("scan_accessibility_rule_counts").select("*").eq("scan_id", input.scanId),
    input.supabase.from("scan_accessibility_rule_examples").select("*").eq("scan_id", input.scanId),
    input.supabase.from("policy_enrichment").select("*").eq("scan_id", input.scanId).order("created_at", { ascending: true }),
    input.supabase.from("policy_review_queue").select("*").eq("scan_id", input.scanId).order("created_at", { ascending: true }),
    input.supabase
      .from("scan_signals")
      .select("category, signal_key, signal_label, signal_value_json, value_type")
      .eq("scan_id", input.scanId),
    input.supabase
      .from("scan_events")
      .select("id, event_type, message, metadata_json, created_at")
      .eq("scan_id", input.scanId)
      .order("created_at", { ascending: true }),
    input.runId
      ? input.supabase
          .from("validation_run_findings")
          .select(
            "id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json, validation_verdicts ( verdict, confidence, rationale, agreement_score, model, prompt_version, system_confidence_score, system_confidence_band, system_confidence_explanation )"
          )
          .eq("validation_run_id", input.runId)
      : Promise.resolve({ data: [] as ValidationFindingWithVerdictRow[], error: null })
  ]);

  if (snapshotError) {
    throw new Error(`Failed to load snapshot for ${input.scanId}: ${snapshotError.message}`);
  }
  if (runtimeArtifactsError) {
    throw new Error(`Failed to load runtime artifacts for ${input.scanId}: ${runtimeArtifactsError.message}`);
  }
  if (preconsentError) {
    throw new Error(`Failed to load preconsent violations for ${input.scanId}: ${preconsentError.message}`);
  }
  if (trackerError) {
    throw new Error(`Failed to load tracker vendors for ${input.scanId}: ${trackerError.message}`);
  }
  if (accessibilityRuleCountsError) {
    throw new Error(`Failed to load accessibility rule counts for ${input.scanId}: ${accessibilityRuleCountsError.message}`);
  }
  if (accessibilityRuleExamplesError) {
    throw new Error(`Failed to load accessibility rule examples for ${input.scanId}: ${accessibilityRuleExamplesError.message}`);
  }
  if (policyEnrichmentError) {
    throw new Error(`Failed to load policy enrichment for ${input.scanId}: ${policyEnrichmentError.message}`);
  }
  if (policyReviewQueueError) {
    throw new Error(`Failed to load policy review queue for ${input.scanId}: ${policyReviewQueueError.message}`);
  }
  if (signalsError) {
    throw new Error(`Failed to load signals for ${input.scanId}: ${signalsError.message}`);
  }
  if (eventsError) {
    throw new Error(`Failed to load events for ${input.scanId}: ${eventsError.message}`);
  }
  if (validationFindingsError) {
    throw new Error(`Failed to load validation findings for ${input.scanId}: ${validationFindingsError.message}`);
  }

  const normalizedSignals = ((signals ?? []) as Array<Record<string, unknown>>).map((signal) => {
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

  const normalizedPolicyEnrichment = ((policyEnrichment ?? []) as Array<Record<string, unknown>>).map((row) => {
    const next = { ...row };
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

  const mappedValidationFindings: ScanValidationFinding[] = ((validationFindingRows ?? []) as ValidationFindingWithVerdictRow[]).map((row) => {
    const verdictRows = Array.isArray(row.validation_verdicts)
      ? row.validation_verdicts
      : row.validation_verdicts
        ? [row.validation_verdicts]
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
    accessibilityRuleCounts: (accessibilityRuleCounts ?? []) as Array<Record<string, unknown>>,
    accessibilityRuleExamples: (accessibilityRuleExamples ?? []) as Array<Record<string, unknown>>,
    events: repairedEvents,
    policyEnrichment: normalizedPolicyEnrichment,
    policyReviewQueue: ((policyReviewQueue ?? []) as Array<Record<string, unknown>>).map((row) => {
      const next = { ...row };
      delete next.created_at;
      delete next.updated_at;
      return next;
    }),
    preconsentViolations: (preconsentViolations ?? []) as Array<Record<string, unknown>>,
    runtimeArtifacts: (runtimeArtifacts as Record<string, unknown> | null) ?? null,
    signals: normalizedSignals,
    snapshot: (snapshot as Record<string, unknown> | null) ?? null,
    trackerVendors: (trackerVendors ?? []) as Array<Record<string, unknown>>,
    validationFindings: mappedValidationFindings
  };
}

let buildScanReportUnifiedFindingsPromise:
  | Promise<(scanRecord: Record<string, unknown>) => Array<Record<string, unknown>>>
  | null = null;

async function getBuildScanReportUnifiedFindings() {
  if (!buildScanReportUnifiedFindingsPromise) {
    const detailViewModulePath = "../../web/components/scans/shared-scan-detail-view";
    buildScanReportUnifiedFindingsPromise = import(detailViewModulePath).then(
      (module) =>
        (module as {
          buildScanReportUnifiedFindings: (scanRecord: Record<string, unknown>) => Array<Record<string, unknown>>;
        }).buildScanReportUnifiedFindings
    );
  }

  return buildScanReportUnifiedFindingsPromise;
}

async function computeReportFindingCount(scanRecord: Awaited<ReturnType<typeof loadScanRecordForFindingCount>>) {
  try {
    const buildScanReportUnifiedFindings = await getBuildScanReportUnifiedFindings();
    return buildScanReportUnifiedFindings(scanRecord).length;
  } catch (error) {
    console.error("[backfill-report-finding-counts] falling back to surfaced finding count", {
      error: error instanceof Error ? error.message : String(error)
    });
    const validationFindingLookup = new Map(
      scanRecord.validationFindings.map((finding) => [finding.ruleKey, finding] as const)
    );
    const displayPackets = buildUnifiedFindingDisplayPackets({
      policyEnrichment: scanRecord.policyEnrichment,
      reviewFindingCandidates: [],
      scanEvents: scanRecord.events,
      validationFindings: scanRecord.validationFindings,
      validationFindingLookup
    });

    return displayPackets.filter((finding) => finding.presentationDecision.status !== "suppress").length;
  }
}

async function main() {
  const supabase = createAdminClient(process.env);
  const limit = Number(getArgValue("--limit") ?? "200");
  const dryRun = hasFlag("--dry-run");
  const sinceDays = Number(getArgValue("--since-days") ?? "14");
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("scan_snapshots")
    .select("scan_id, scans!inner(id, completed_at)")
    .is("report_finding_count", null)
    .not("scan_id", "is", null)
    .gte("scans.completed_at", sinceIso)
    .order("completed_at", { ascending: false, referencedTable: "scans" })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load candidate scans: ${error.message}`);
  }

  const candidates = ((rows ?? []) as Array<{ scan_id: string; scans: ScanCandidateRow | ScanCandidateRow[] | null }>)
    .map((row) => ({
      scanId: row.scan_id,
      scan:
        Array.isArray(row.scans)
          ? (row.scans[0] ?? null)
          : row.scans
    }))
    .filter((row): row is { scanId: string; scan: ScanCandidateRow } => Boolean(row.scanId && row.scan?.id));

  const scanIds = candidates.map((row) => row.scanId);
  const latestValidationRunByScanId = new Map<string, string | null>();
  for (const batch of chunkValues(scanIds, 50)) {
    const { data: validationRuns, error: validationRunsError } = await supabase
      .from("validation_runs")
      .select("id, scan_id, created_at")
      .in("scan_id", batch)
      .order("created_at", { ascending: false });

    if (validationRunsError) {
      throw new Error(`Failed to load validation runs: ${validationRunsError.message}`);
    }

    for (const row of (validationRuns ?? []) as ValidationRunRow[]) {
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
        scanId: candidate.scanId,
        supabase
      });
      const count = await computeReportFindingCount(scanRecord);
      console.log(`${candidate.scanId} ${count}`);

      if (dryRun) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("scan_snapshots")
        .update({
          report_finding_count: count
        })
        .eq("scan_id", candidate.scanId);

      if (updateError) {
        throw new Error(`Failed to update ${candidate.scanId}: ${updateError.message}`);
      }

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
