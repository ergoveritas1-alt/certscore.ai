"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  VALIDATION_DEFAULT_INTERVAL_MINUTES,
  VALIDATION_DEFAULT_RUN_MODE,
  VALIDATION_INTERVAL_OPTIONS,
  type ValidationAgreementScore,
  type ValidationPipelineState,
  type ValidationRunMode,
  type ValidationRunStatus,
  type ValidationVerdict
} from "@website-signal-risk-scanner/shared";
import { normalizeUrl, extractHostname } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { enqueueValidationCollectJob, getValidationQueueAvailability } from "../queue/validation-queue";
import { requireValidationAdminContext } from "./auth";

type ValidationSettingsRow = {
  automatic_interval_minutes: number;
  last_tranco_sync_at: string | null;
  next_due_at: string | null;
  operator_note: string | null;
  pipeline_enabled: boolean;
  run_mode: ValidationRunMode;
  singleton_key: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

type ValidationRunRow = {
  average_agreement_score: number | null;
  completed_at: string | null;
  created_at: string;
  error_message: string | null;
  finding_count: number;
  hostname: string;
  id: string;
  rank_band: string | null;
  reviewed_finding_count: number;
  scan_id: string | null;
  status: ValidationRunStatus;
  tranco_rank: number | null;
  trigger_mode: ValidationRunMode;
};

type ValidationTargetRow = {
  active: boolean;
  backoff_until: string | null;
  cooldown_until: string | null;
  deny_reason: string | null;
  denylisted: boolean;
  hostname: string;
  id: string;
  last_error: string | null;
  last_status: string | null;
  normalized_url: string;
  rank_band: string | null;
  tranco_rank: number | null;
};

type ValidationRunFindingRow = {
  category: string;
  description: string;
  evidence_json: Record<string, unknown>;
  finding_rank: number;
  id: string;
  page_url: string | null;
  rule_key: string;
  severity: string;
  subtype: string | null;
  title: string;
};

type ValidationVerdictRow = {
  agreement_score: ValidationAgreementScore;
  confidence: number;
  evidence_json: Record<string, unknown>;
  model: string;
  prompt_version: string;
  rationale: string;
  validation_run_finding_id: string;
  verdict: ValidationVerdict;
};

async function ensureValidationDomainForOrganization(input: {
  organizationId: string;
  hostname: string;
  normalizedUrl: string;
}) {
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("domains")
    .select("id, hostname, normalized_url")
    .eq("organization_id", input.organizationId)
    .eq("normalized_url", input.normalizedUrl)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load validation domain ${input.normalizedUrl}: ${existingError.message}`);
  }

  if (existing) {
    return existing as { hostname: string; id: string; normalized_url: string };
  }

  const { data, error } = await supabase
    .from("domains")
    .insert({
      hostname: input.hostname,
      normalized_url: input.normalizedUrl,
      organization_id: input.organizationId,
      scan_frequency: "manual"
    })
    .select("id, hostname, normalized_url")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation domain ${input.hostname}: ${error?.message ?? "Unknown error"}`);
  }

  return data as { hostname: string; id: string; normalized_url: string };
}

async function createValidationScan(input: {
  domainId: string;
  hostname: string;
  normalizedUrl: string;
  organizationId: string;
  pagesRequested?: number;
  submittedByUserId: string;
}) {
  const supabase = createAdminClient();
  const pagesRequested = Math.max(3, input.pagesRequested ?? 8);
  const scanConfig = {
    hostname: input.hostname,
    maxPages: pagesRequested,
    normalizedUrl: input.normalizedUrl,
    processor: "agentic-validation-v1",
    profile: "agentic-validation-v1",
    source: "validation-manual"
  };

  const { data, error } = await supabase
    .from("scans")
    .insert({
      domain_id: input.domainId,
      organization_id: input.organizationId,
      pages_requested: pagesRequested,
      pages_scanned: 0,
      scan_config_json: scanConfig,
      scan_type: "full",
      status: "queued",
      submitted_by_user_id: input.submittedByUserId
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation scan for ${input.hostname}: ${error?.message ?? "Unknown error"}`);
  }

  const scanId = (data as { id: string }).id;
  const { error: domainError } = await supabase
    .from("domains")
    .update({ latest_scan_id: scanId })
    .eq("id", input.domainId)
    .eq("organization_id", input.organizationId);
  if (domainError) {
    throw new Error(`Failed to set validation domain latest scan: ${domainError.message}`);
  }

  return scanId;
}

function getPipelineState(settings: ValidationSettingsRow): ValidationPipelineState {
  return process.env.VALIDATION_PIPELINE_ENABLED === "0"
    ? "paused_by_env"
    : settings.pipeline_enabled
      ? "running"
      : "paused_by_admin";
}

async function requireAdmin() {
  return requireValidationAdminContext();
}

export async function getValidationSettings() {
  const context = await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_settings")
    .upsert(
      {
        automatic_interval_minutes: VALIDATION_DEFAULT_INTERVAL_MINUTES,
        run_mode: VALIDATION_DEFAULT_RUN_MODE,
        singleton_key: "default"
      },
      { onConflict: "singleton_key" }
    )
    .select("singleton_key, pipeline_enabled, run_mode, automatic_interval_minutes, operator_note, updated_at, updated_by_user_id, next_due_at, last_tranco_sync_at")
    .single();

  if (error || !data) {
    throw new Error(`Failed to load validation settings: ${error?.message ?? "Unknown error"}`);
  }

  const row = data as ValidationSettingsRow;
  return {
    automaticIntervalMinutes: row.automatic_interval_minutes,
    lastTrancoSyncAt: row.last_tranco_sync_at,
    nextDueAt: row.next_due_at,
    operatorNote: row.operator_note,
    pipelineEnabled: row.pipeline_enabled,
    pipelineState: getPipelineState(row),
    runMode: row.run_mode,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
    viewerEmail: context.user.email ?? ""
  };
}

export async function listValidationTargets(limit = 25) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_targets")
    .select("id, hostname, normalized_url, tranco_rank, rank_band, active, denylisted, deny_reason, cooldown_until, backoff_until, last_status, last_error")
    .eq("source", "manual")
    .order("tranco_rank", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load validation targets: ${error.message}`);
  }

  return ((data ?? []) as ValidationTargetRow[]).map((row) => ({
    active: row.active,
    backoffUntil: row.backoff_until,
    cooldownUntil: row.cooldown_until,
    denyReason: row.deny_reason,
    denylisted: row.denylisted,
    hostname: row.hostname,
    id: row.id,
    lastError: row.last_error,
    lastStatus: row.last_status,
    normalizedUrl: row.normalized_url,
    rankBand: row.rank_band,
    trancoRank: row.tranco_rank
  }));
}

export async function listValidationRuns(input?: {
  page?: number;
  rankBand?: string | null;
  ruleKey?: string | null;
  status?: string | null;
}) {
  await requireAdmin();
  const supabase = createAdminClient();
  const page = Math.max(1, input?.page ?? 1);
  const from = (page - 1) * 50;
  const to = from + 49;

  let scanIdsFilter: string[] | null = null;
  if (input?.ruleKey) {
    const { data: matchingRunIds, error: runIdsError } = await supabase
      .from("validation_run_findings")
      .select("validation_run_id")
      .eq("rule_key", input.ruleKey);

    if (runIdsError) {
      throw new Error(`Failed to filter validation runs by rule key: ${runIdsError.message}`);
    }

    scanIdsFilter = [...new Set(((matchingRunIds ?? []) as Array<{ validation_run_id: string }>).map((row) => row.validation_run_id))];
    if (scanIdsFilter.length === 0) {
      return {
        items: [],
        page,
        pageCount: 0,
        totalCount: 0
      };
    }
  }

  let query = supabase
    .from("validation_runs")
    .select("id, hostname, tranco_rank, rank_band, trigger_mode, status, scan_id, created_at, completed_at, finding_count, reviewed_finding_count, average_agreement_score, error_message", {
      count: "exact"
    })
    .order("created_at", { ascending: false });

  if (input?.status) {
    query = query.eq("status", input.status);
  }

  if (input?.rankBand) {
    query = query.eq("rank_band", input.rankBand);
  }

  if (scanIdsFilter) {
    query = query.in("id", scanIdsFilter);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw new Error(`Failed to load validation runs: ${error.message}`);
  }

  const rows = (data ?? []) as ValidationRunRow[];
  const runIds = rows.map((row) => row.id);
  const findingIdsByRun = new Map<string, string[]>();
  const verdictSummaryByRun = new Map<string, { inconclusive: number; notSupported: number; supported: number }>();

  if (runIds.length > 0) {
    const { data: findings, error: findingsError } = await supabase
      .from("validation_run_findings")
      .select("id, validation_run_id")
      .in("validation_run_id", runIds);

    if (findingsError) {
      throw new Error(`Failed to load validation run findings: ${findingsError.message}`);
    }

    for (const row of (findings ?? []) as Array<{ id: string; validation_run_id: string }>) {
      const list = findingIdsByRun.get(row.validation_run_id) ?? [];
      list.push(row.id);
      findingIdsByRun.set(row.validation_run_id, list);
    }

    const allFindingIds = [...findingIdsByRun.values()].flat();
    if (allFindingIds.length > 0) {
      const { data: verdicts, error: verdictsError } = await supabase
        .from("validation_verdicts")
        .select("validation_run_finding_id, verdict")
        .in("validation_run_finding_id", allFindingIds);

      if (verdictsError) {
        throw new Error(`Failed to load validation verdict summaries: ${verdictsError.message}`);
      }

      const runIdByFindingId = new Map<string, string>();
      for (const [runId, findingIds] of findingIdsByRun.entries()) {
        for (const findingId of findingIds) {
          runIdByFindingId.set(findingId, runId);
        }
      }

      for (const row of (verdicts ?? []) as Array<{ validation_run_finding_id: string; verdict: ValidationVerdict }>) {
        const runId = runIdByFindingId.get(row.validation_run_finding_id);
        if (!runId) {
          continue;
        }

        const summary = verdictSummaryByRun.get(runId) ?? { inconclusive: 0, notSupported: 0, supported: 0 };
        if (row.verdict === "supported") {
          summary.supported += 1;
        } else if (row.verdict === "not_supported") {
          summary.notSupported += 1;
        } else {
          summary.inconclusive += 1;
        }
        verdictSummaryByRun.set(runId, summary);
      }
    }
  }

  const totalCount = count ?? 0;
  return {
    items: rows.map((row) => ({
      averageAgreementScore: row.average_agreement_score,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      errorMessage: row.error_message,
      findingCount: row.finding_count,
      hostname: row.hostname,
      id: row.id,
      rankBand: row.rank_band,
      reviewedFindingCount: row.reviewed_finding_count,
      scanId: row.scan_id,
      status: row.status,
      trancoRank: row.tranco_rank,
      triggerMode: row.trigger_mode,
      verdictSummary: verdictSummaryByRun.get(row.id) ?? { inconclusive: 0, notSupported: 0, supported: 0 }
    })),
    page,
    pageCount: Math.ceil(totalCount / 50),
    totalCount
  };
}

export async function getValidationRunDetail(validationRunId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: run, error: runError } = await supabase
    .from("validation_runs")
    .select("id, hostname, tranco_rank, rank_band, trigger_mode, status, scan_id, created_at, completed_at, finding_count, reviewed_finding_count, average_agreement_score, error_message")
    .eq("id", validationRunId)
    .maybeSingle();

  if (runError) {
    throw new Error(`Failed to load validation run ${validationRunId}: ${runError.message}`);
  }

  if (!run) {
    return null;
  }

  const { data: findings, error: findingsError } = await supabase
    .from("validation_run_findings")
    .select("id, category, subtype, rule_key, title, description, severity, page_url, evidence_json, finding_rank")
    .eq("validation_run_id", validationRunId)
    .order("finding_rank", { ascending: true });

  if (findingsError) {
    throw new Error(`Failed to load validation run findings: ${findingsError.message}`);
  }

  const findingIds = ((findings ?? []) as ValidationRunFindingRow[]).map((row) => row.id);
  const verdictMap = new Map<string, ValidationVerdictRow>();
  if (findingIds.length > 0) {
    const { data: verdicts, error: verdictsError } = await supabase
      .from("validation_verdicts")
      .select("validation_run_finding_id, verdict, confidence, rationale, evidence_json, model, prompt_version, agreement_score")
      .in("validation_run_finding_id", findingIds);

    if (verdictsError) {
      throw new Error(`Failed to load validation verdicts: ${verdictsError.message}`);
    }

    for (const row of (verdicts ?? []) as ValidationVerdictRow[]) {
      verdictMap.set(row.validation_run_finding_id, row);
    }
  }

  return {
    averageAgreementScore: (run as ValidationRunRow).average_agreement_score,
    completedAt: (run as ValidationRunRow).completed_at,
    createdAt: (run as ValidationRunRow).created_at,
    errorMessage: (run as ValidationRunRow).error_message,
    findingCount: (run as ValidationRunRow).finding_count,
    hostname: (run as ValidationRunRow).hostname,
    id: (run as ValidationRunRow).id,
    rankBand: (run as ValidationRunRow).rank_band,
    reviewedFindingCount: (run as ValidationRunRow).reviewed_finding_count,
    scanId: (run as ValidationRunRow).scan_id,
    status: (run as ValidationRunRow).status,
    trancoRank: (run as ValidationRunRow).tranco_rank,
    triggerMode: (run as ValidationRunRow).trigger_mode,
    rows: ((findings ?? []) as ValidationRunFindingRow[]).map((finding) => ({
      agreementScore: verdictMap.get(finding.id)?.agreement_score ?? null,
      automatedFinding: {
        category: finding.category,
        description: finding.description,
        evidence: finding.evidence_json ?? {},
        pageUrl: finding.page_url,
        rank: finding.finding_rank,
        ruleKey: finding.rule_key,
        severity: finding.severity,
        subtype: finding.subtype,
        title: finding.title
      },
      verdict:
        verdictMap.get(finding.id)
          ? {
              confidence: verdictMap.get(finding.id)?.confidence ?? 0,
              evidence: verdictMap.get(finding.id)?.evidence_json ?? {},
              model: verdictMap.get(finding.id)?.model ?? "",
              promptVersion: verdictMap.get(finding.id)?.prompt_version ?? "",
              rationale: verdictMap.get(finding.id)?.rationale ?? "",
              verdict: verdictMap.get(finding.id)?.verdict ?? "inconclusive"
            }
          : null
    }))
  };
}

export async function getValidationIssueAnalytics() {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: findings, error: findingsError } = await supabase
    .from("validation_run_findings")
    .select("id, rule_key, title");

  if (findingsError) {
    throw new Error(`Failed to load validation finding analytics: ${findingsError.message}`);
  }

  const findingRows = (findings ?? []) as Array<{ id: string; rule_key: string; title: string }>;
  const findingIds = findingRows.map((row) => row.id);
  const verdictMap = new Map<string, ValidationVerdict>();

  if (findingIds.length > 0) {
    const { data: verdicts, error: verdictsError } = await supabase
      .from("validation_verdicts")
      .select("validation_run_finding_id, verdict")
      .in("validation_run_finding_id", findingIds);

    if (verdictsError) {
      throw new Error(`Failed to load validation verdict analytics: ${verdictsError.message}`);
    }

    for (const row of (verdicts ?? []) as Array<{ validation_run_finding_id: string; verdict: ValidationVerdict }>) {
      verdictMap.set(row.validation_run_finding_id, row.verdict);
    }
  }

  const byRule = new Map<
    string,
    {
      flaggedCount: number;
      inconclusiveCount: number;
      notSupportedCount: number;
      reviewedCount: number;
      supportedCount: number;
      title: string;
    }
  >();

  for (const finding of findingRows) {
    const bucket = byRule.get(finding.rule_key) ?? {
      flaggedCount: 0,
      inconclusiveCount: 0,
      notSupportedCount: 0,
      reviewedCount: 0,
      supportedCount: 0,
      title: finding.title
    };
    bucket.flaggedCount += 1;
    const verdict = verdictMap.get(finding.id);
    if (verdict) {
      bucket.reviewedCount += 1;
      if (verdict === "supported") {
        bucket.supportedCount += 1;
      } else if (verdict === "not_supported") {
        bucket.notSupportedCount += 1;
      } else {
        bucket.inconclusiveCount += 1;
      }
    }
    byRule.set(finding.rule_key, bucket);
  }

  return [...byRule.entries()]
    .map(([ruleKey, row]) => ({
      ...row,
      notSupportedRate: row.reviewedCount > 0 ? row.notSupportedCount / row.reviewedCount : 0,
      ruleKey,
      supportedRate: row.reviewedCount > 0 ? row.supportedCount / row.reviewedCount : 0
    }))
    .sort((left, right) => right.reviewedCount - left.reviewedCount || left.supportedRate - right.supportedRate);
}

export async function updateValidationSettingsAction(input: {
  automaticIntervalMinutes?: number;
  operatorNote?: string | null;
  pipelineEnabled?: boolean;
  runMode?: ValidationRunMode;
}) {
  const context = await requireAdmin();
  const supabase = createAdminClient();

  if (input.automaticIntervalMinutes !== undefined && !(VALIDATION_INTERVAL_OPTIONS as readonly number[]).includes(input.automaticIntervalMinutes)) {
    throw new Error("Invalid validation interval.");
  }

  const patch: Record<string, boolean | number | string | null> = {
    updated_by_user_id: context.user.id
  };

  if (input.automaticIntervalMinutes !== undefined) {
    patch.automatic_interval_minutes = input.automaticIntervalMinutes;
  }

  if (input.pipelineEnabled !== undefined) {
    patch.pipeline_enabled = input.pipelineEnabled;
  }

  if (input.runMode !== undefined) {
    patch.run_mode = input.runMode;
  }

  if (input.operatorNote !== undefined) {
    patch.operator_note = input.operatorNote;
  }

  const { error } = await supabase.from("validation_settings").update(patch).eq("singleton_key", "default");
  if (error) {
    throw new Error(`Failed to update validation settings: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type:
      input.pipelineEnabled !== undefined
        ? input.pipelineEnabled
          ? "validation.pipeline_resumed"
          : "validation.pipeline_paused"
        : input.runMode !== undefined
          ? "validation.mode_changed"
          : "validation.interval_changed",
    metadata_json: input,
    reason: input.operatorNote ?? null
  });

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/issues");
}

export async function queueManualValidationRunAction(input: { targetId: string }) {
  const context = await requireAdmin();
  const availability = getValidationQueueAvailability();
  if (!availability.enabled) {
    throw new Error(availability.reason ?? "Validation queue is unavailable.");
  }

  const supabase = createAdminClient();
  const { data: target, error } = await supabase
    .from("validation_targets")
    .select("id, hostname, normalized_url, tranco_rank")
    .eq("id", input.targetId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load validation target: ${error.message}`);
  }

  if (!target) {
    throw new Error("Validation target not found.");
  }

  const { data: settings, error: settingsError } = await supabase
    .from("validation_settings")
    .select("pipeline_enabled")
    .eq("singleton_key", "default")
    .single();

  if (settingsError) {
    throw new Error(`Failed to load validation pipeline state: ${settingsError.message}`);
  }

  if (process.env.VALIDATION_PIPELINE_ENABLED === "0" || !(settings as { pipeline_enabled: boolean }).pipeline_enabled) {
    throw new Error("Validation pipeline is paused.");
  }

  const domain = await ensureValidationDomainForOrganization({
    hostname: (target as { hostname: string }).hostname,
    normalizedUrl: (target as { normalized_url: string }).normalized_url,
    organizationId: context.organization.id
  });
  const scanId = await createValidationScan({
    domainId: domain.id,
    hostname: (target as { hostname: string }).hostname,
    normalizedUrl: (target as { normalized_url: string }).normalized_url,
    organizationId: context.organization.id,
    submittedByUserId: context.user.id
  });

  const { data: run, error: runError } = await supabase
    .from("validation_runs")
    .insert({
      domain_id: domain.id,
      hostname: (target as { hostname: string }).hostname,
      normalized_url: (target as { normalized_url: string }).normalized_url,
      rank_band:
        typeof (target as { tranco_rank: number | null }).tranco_rank === "number"
          ? (target as { tranco_rank: number }).tranco_rank <= 5_000
            ? "1k-5k"
            : (target as { tranco_rank: number }).tranco_rank <= 20_000
              ? "5k-20k"
              : (target as { tranco_rank: number }).tranco_rank <= 50_000
                ? "20k-50k"
                : "50k-100k"
          : null,
      scan_id: scanId,
      status: "queued",
      tranco_rank: (target as { tranco_rank: number | null }).tranco_rank,
      trigger_mode: "manual",
      triggered_by_user_id: context.user.id,
      validation_target_id: (target as { id: string }).id
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create manual validation run: ${runError?.message ?? "Unknown error"}`);
  }

  const { error: targetError } = await supabase
    .from("validation_targets")
    .update({
      last_error: null,
      last_run_at: new Date().toISOString(),
      last_status: "queued"
    })
    .eq("id", (target as { id: string }).id);

  if (targetError) {
    throw new Error(`Failed to mark validation target queued: ${targetError.message}`);
  }

  await enqueueValidationCollectJob((run as { id: string }).id);
  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: "validation.manual_run_queued",
    metadata_json: {
      hostname: (target as { hostname: string }).hostname,
      targetId: input.targetId,
      validationRunId: (run as { id: string }).id
    }
  });

  const { error: removeError } = await supabase.from("validation_targets").delete().eq("id", (target as { id: string }).id);
  if (removeError) {
    throw new Error(`Failed to consume validation target from queue: ${removeError.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: "validation.target_removed",
    metadata_json: {
      hostname: (target as { hostname: string }).hostname,
      reason: "queued_for_manual_run",
      targetId: input.targetId,
      validationRunId: (run as { id: string }).id
    }
  });

  await addRandomTrancoValidationTarget({
    actorUserId: context.user.id,
    eventType: "validation.target_added",
    excludedHostnames: [(target as { hostname: string }).hostname],
    metadata: {
      replacedHostname: (target as { hostname: string }).hostname,
      validationRunId: (run as { id: string }).id
    },
    supabase
  });

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/validation");

  return {
    scanId,
    validationRunId: (run as { id: string }).id
  };
}

export async function updateValidationTargetStateAction(input: {
  clearBackoff?: boolean;
  denyReason?: string | null;
  denylisted?: boolean;
  targetId: string;
}) {
  const context = await requireAdmin();
  const supabase = createAdminClient();
  const patch: Record<string, string | boolean | null> = {};

  if (input.clearBackoff) {
    patch.backoff_until = null;
    patch.cooldown_until = null;
    patch.last_error = null;
  }

  if (input.denylisted !== undefined) {
    patch.denylisted = input.denylisted;
    patch.deny_reason = input.denylisted ? input.denyReason ?? "Suppressed by operator." : null;
  }

  const { error } = await supabase.from("validation_targets").update(patch).eq("id", input.targetId);
  if (error) {
    throw new Error(`Failed to update validation target: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: input.denylisted ? "validation.target_suppressed" : input.clearBackoff ? "validation.target_backoff_cleared" : "validation.target_updated",
    metadata_json: input
  });

  revalidatePath("/app");
  revalidatePath("/app/scans");
}

export async function removeValidationTargetAction(input: { targetId: string }) {
  const context = await requireAdmin();
  const supabase = createAdminClient();

  const { data: target, error: loadError } = await supabase
    .from("validation_targets")
    .select("id, hostname")
    .eq("id", input.targetId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load validation target: ${loadError.message}`);
  }

  if (!target) {
    throw new Error("Validation target not found.");
  }

  const { error } = await supabase.from("validation_targets").delete().eq("id", input.targetId);
  if (error) {
    throw new Error(`Failed to remove validation target: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: "validation.target_removed",
    metadata_json: {
      hostname: (target as { hostname: string }).hostname,
      targetId: input.targetId
    }
  });

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/validation");
}

async function pickRandomTrancoValidationTarget(
  supabase: ReturnType<typeof createAdminClient>,
  excludedHostnames: string[] = []
) {
  const targetRank = Math.floor(Math.random() * (50_000 - 1_000 + 1)) + 1_000;
  const excluded = excludedHostnames.filter(Boolean);

  const loadCandidate = async (direction: "gte" | "lte") => {
    let query = supabase
      .from("validation_targets")
      .select("hostname, normalized_url, tranco_rank")
      .eq("source", "tranco")
      .gte("tranco_rank", 1_000)
      .lte("tranco_rank", 50_000)
      .limit(1);

    query =
      direction === "gte"
        ? query.gte("tranco_rank", targetRank).order("tranco_rank", { ascending: true })
        : query.lte("tranco_rank", targetRank).order("tranco_rank", { ascending: false });

    if (excluded.length > 0) {
      query = query.not("hostname", "in", `(${excluded.map((hostname) => `"${hostname}"`).join(",")})`);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`Failed to load Tranco validation target: ${error.message}`);
    }

    return (data as { hostname: string; normalized_url: string; tranco_rank: number | null } | null) ?? null;
  };

  const higherCandidate = await loadCandidate("gte");
  const lowerCandidate = await loadCandidate("lte");
  const candidate =
    higherCandidate && lowerCandidate
      ? Math.abs((higherCandidate.tranco_rank ?? targetRank) - targetRank) <= Math.abs((lowerCandidate.tranco_rank ?? targetRank) - targetRank)
        ? higherCandidate
        : lowerCandidate
      : higherCandidate ?? lowerCandidate;

  if (!candidate) {
    throw new Error("No Tranco validation target is available in the 1000-50000 range.");
  }

  return {
    candidate,
    targetRank
  };
}

async function addRandomTrancoValidationTarget(params: {
  actorUserId: string;
  excludedHostnames?: string[];
  eventType?: string;
  metadata?: Record<string, unknown>;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const { actorUserId, excludedHostnames, eventType = "validation.target_added", metadata, supabase } = params;
  const { candidate, targetRank } = await pickRandomTrancoValidationTarget(supabase, excludedHostnames);

  const hostname = extractHostname(candidate.normalized_url);
  const normalizedUrl = normalizeUrl(candidate.normalized_url);

  const { error } = await supabase.from("validation_targets").upsert(
    {
      active: true,
      denylisted: false,
      hostname,
      normalized_url: normalizedUrl,
      source: "manual"
    },
    { onConflict: "hostname" }
  );

  if (error) {
    throw new Error(`Failed to add validation target: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: actorUserId,
    event_type: eventType,
    metadata_json: {
      hostname,
      ...metadata,
      normalizedUrl,
      selectedRank: candidate.tranco_rank,
      targetRank
    }
  });

  return {
    hostname,
    normalizedUrl,
    selectedRank: candidate.tranco_rank,
    targetRank
  };
}

export async function addValidationTargetAction(input: { hostname: string }) {
  const context = await requireAdmin();
  const supabase = createAdminClient();
  const normalizedUrl = normalizeUrl(input.hostname);
  const hostname = extractHostname(normalizedUrl);

  const { error } = await supabase.from("validation_targets").upsert(
    {
      active: true,
      denylisted: false,
      hostname,
      normalized_url: normalizedUrl,
      source: "manual"
    },
    { onConflict: "hostname" }
  );

  if (error) {
    throw new Error(`Failed to add validation target: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: "validation.target_added",
    metadata_json: {
      hostname,
      normalizedUrl,
      source: "manual_entry"
    }
  });

  revalidatePath("/app");
  revalidatePath("/app/validation");
}
