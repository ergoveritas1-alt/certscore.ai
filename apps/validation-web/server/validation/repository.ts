"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  VALIDATION_INTERNAL_ORG_SLUG,
  VALIDATION_INTERVAL_OPTIONS,
  VALIDATION_RANK_BANDS,
  type ValidationAgreementScore,
  type ValidationRunMode
} from "@website-signal-risk-scanner/validation-shared";
import { extractHostname, normalizeUrl } from "@website-signal-risk-scanner/shared";
import { getWebServerEnv } from "../../lib/env";
import { requireValidationAdminContext } from "./auth";

type ValidationSettingsRow = {
  automatic_interval_minutes: number;
  last_scheduled_at: string | null;
  last_tranco_sync_at: string | null;
  next_due_at: string | null;
  operator_note: string | null;
  pipeline_enabled: boolean;
  run_mode: ValidationRunMode;
  updated_at: string;
  updated_by_user_id: string | null;
};

type ValidationTargetRow = {
  active: boolean;
  backoff_until: string | null;
  cooldown_until: string | null;
  deny_reason: string | null;
  denylisted: boolean;
  failure_count: number;
  hostname: string;
  id: string;
  last_completed_at: string | null;
  last_error: string | null;
  last_run_at: string | null;
  last_status: string | null;
  normalized_url: string;
  rank_band: string | null;
  source: string;
  tranco_rank: number | null;
};

const TRANCO_SOURCE_FALLBACK_URL = "https://tranco-list.eu/latest_list";

function isMissingValidationSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  return error.code === "PGRST205" || error.message?.includes("Could not find the table 'public.validation_") === true;
}

function getPipelineState(settings: ValidationSettingsRow) {
  if (process.env.VALIDATION_PIPELINE_ENABLED === "0") {
    return "paused_by_env" as const;
  }

  if (!settings.pipeline_enabled) {
    return "paused_by_admin" as const;
  }

  return "running" as const;
}

function rankBandForRank(rank: number | null) {
  if (!rank) {
    return null;
  }

  const match = VALIDATION_RANK_BANDS.find((band) => rank >= band.min && rank <= band.max);
  return match?.key ?? null;
}

async function listTrancoPreviewTargets(limit = 5) {
  const env = getWebServerEnv();
  const response = await fetch(env.VALIDATION_TRANCO_SOURCE_URL ?? TRANCO_SOURCE_FALLBACK_URL, {
    headers: {
      "User-Agent": "ValidationOpsCrawler/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Tranco source: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  let body = await response.text();

  if (contentType.includes("text/html") || body.includes("/download/")) {
    const match = body.match(/href="(\/download\/[^"]+\/1000000)"/i);

    if (!match?.[1]) {
      throw new Error("Failed to resolve Tranco CSV download URL.");
    }

    const csvUrl = new URL(match[1], "https://tranco-list.eu").toString();
    const csvResponse = await fetch(csvUrl, {
      headers: {
        "User-Agent": "ValidationOpsCrawler/1.0"
      }
    });

    if (!csvResponse.ok) {
      throw new Error(`Failed to fetch Tranco CSV: ${csvResponse.status}`);
    }

    body = await csvResponse.text();
  }

  const minRank = env.VALIDATION_TRANCO_MIN_RANK ?? 1000;
  const maxRank = env.VALIDATION_TRANCO_MAX_RANK ?? 100000;
  const rows: ValidationTargetRow[] = [];

  for (const line of body.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    const [rankText, hostText] = line.split(",");
    const rank = Number(rankText);
    const hostname = hostText?.trim().toLowerCase();

    if (!Number.isFinite(rank) || !hostname) {
      continue;
    }
    if (rank < minRank || rank > maxRank) {
      continue;
    }

    try {
      rows.push({
        active: true,
        backoff_until: null,
        cooldown_until: null,
        deny_reason: null,
        denylisted: false,
        failure_count: 0,
        hostname,
        id: `tranco-preview-${rank}`,
        last_completed_at: null,
        last_error: null,
        last_run_at: null,
        last_status: null,
        normalized_url: normalizeUrl(hostname),
        rank_band: rankBandForRank(rank),
        source: "tranco",
        tranco_rank: rank
      });
    } catch {
      continue;
    }

    if (rows.length >= limit) {
      break;
    }
  }

  return rows;
}

function getUpcomingTargets(targets: ValidationTargetRow[]) {
  const now = new Date();

  const eligibleTargets = targets.filter((target) => {
    if (!target.active || target.denylisted) {
      return false;
    }

    const cooldownOk = !target.cooldown_until || new Date(target.cooldown_until) <= now;
    const backoffOk = !target.backoff_until || new Date(target.backoff_until) <= now;
    return cooldownOk && backoffOk;
  });

  const manualTargets = eligibleTargets
    .filter((target) => target.source === "manual")
    .sort((left, right) => {
      const leftRunAt = left.last_run_at ? new Date(left.last_run_at).getTime() : 0;
      const rightRunAt = right.last_run_at ? new Date(right.last_run_at).getTime() : 0;

      if (leftRunAt !== rightRunAt) {
        return leftRunAt - rightRunAt;
      }

      return left.hostname.localeCompare(right.hostname);
    });

  const shuffledTrancoTargets = eligibleTargets
    .filter(
      (target) =>
        target.source === "tranco" &&
        target.tranco_rank !== null &&
        target.tranco_rank >= 1000 &&
        target.tranco_rank <= 20000
    )
    .sort(() => Math.random() - 0.5);

  return [...manualTargets, ...shuffledTrancoTargets].slice(0, 5);
}

async function ensureSettings() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_settings")
    .select(
      "automatic_interval_minutes, last_scheduled_at, last_tranco_sync_at, next_due_at, operator_note, pipeline_enabled, run_mode, updated_at, updated_by_user_id"
    )
    .eq("singleton", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load validation settings: ${error.message}`);
  }

  if (data) {
    return data as ValidationSettingsRow;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("validation_settings")
    .insert({
      singleton: true
    })
    .select(
      "automatic_interval_minutes, last_scheduled_at, last_tranco_sync_at, next_due_at, operator_note, pipeline_enabled, run_mode, updated_at, updated_by_user_id"
    )
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to initialize validation settings: ${insertError?.message ?? "Unknown error"}`);
  }

  return inserted as ValidationSettingsRow;
}

export async function getValidationOverviewData() {
  const { user } = await requireValidationAdminContext();
  const supabase = createAdminClient();
  try {
    const settings = await ensureSettings();

    const [manualTargetsResult, trancoTargetsResult, runsResult] = await Promise.all([
      supabase
        .from("validation_targets")
        .select(
          "id, hostname, normalized_url, source, tranco_rank, rank_band, active, denylisted, deny_reason, cooldown_until, backoff_until, last_run_at, last_completed_at, last_status, last_error, failure_count"
        )
        .eq("source", "manual")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("validation_targets")
        .select(
          "id, hostname, normalized_url, source, tranco_rank, rank_band, active, denylisted, deny_reason, cooldown_until, backoff_until, last_run_at, last_completed_at, last_status, last_error, failure_count"
        )
        .eq("source", "tranco")
        .gte("tranco_rank", 1000)
        .lte("tranco_rank", 20000)
        .limit(1000),
      supabase
        .from("validation_runs")
        .select("id, hostname, tranco_rank, rank_band, trigger_mode, status, scan_id, finding_count, reviewed_finding_count, average_agreement_score, created_at")
        .order("created_at", { ascending: false })
        .limit(3)
    ]);

    if (manualTargetsResult.error) {
      throw new Error(`Failed to load manual validation targets: ${manualTargetsResult.error.message}`);
    }
    if (trancoTargetsResult.error) {
      throw new Error(`Failed to load upcoming validation targets: ${trancoTargetsResult.error.message}`);
    }
    if (runsResult.error) {
      throw new Error(`Failed to load validation runs: ${runsResult.error.message}`);
    }

    const manualTargets = (manualTargetsResult.data ?? []) as ValidationTargetRow[];
    const trancoTargets = (trancoTargetsResult.data ?? []) as ValidationTargetRow[];
    const fallbackUpcomingTargets =
      manualTargets.length > 0 || trancoTargets.length > 0
        ? [...manualTargets, ...trancoTargets]
        : await listTrancoPreviewTargets(5);

    return {
      allowedIntervals: VALIDATION_INTERVAL_OPTIONS,
      upcomingTargets: getUpcomingTargets(fallbackUpcomingTargets),
      pipelineState: getPipelineState(settings),
      recentRuns: (runsResult.data ?? []) as Array<Record<string, unknown>>,
      settings: {
        automaticIntervalMinutes: settings.automatic_interval_minutes,
        lastScheduledAt: settings.last_scheduled_at,
        lastTrancoSyncAt: settings.last_tranco_sync_at,
        nextDueAt: settings.next_due_at,
        operatorNote: settings.operator_note,
        pipelineEnabled: settings.pipeline_enabled,
        runMode: settings.run_mode,
        updatedAt: settings.updated_at
      },
      setupRequired: false as const,
      targets: getUpcomingTargets(fallbackUpcomingTargets),
      userEmail: user.email
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (isMissingValidationSchemaError({
      message
    })) {
      return {
        allowedIntervals: VALIDATION_INTERVAL_OPTIONS,
        upcomingTargets: [],
        pipelineState: "paused_by_env" as const,
        recentRuns: [],
        settings: null,
        setupRequired: true as const,
        setupMessage: "Validation schema is not available in this database yet. Apply migration 0045 before using /app.",
        targets: [],
        userEmail: user.email
      };
    }

    throw error;
  }
}

export async function listValidationRuns(input?: {
  page?: number;
  rankBand?: string | null;
  status?: string | null;
}) {
  await requireValidationAdminContext();
  const page = Math.max(1, input?.page ?? 1);
  const limit = 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const supabase = createAdminClient();
  let query = supabase
    .from("validation_runs")
    .select(
      "id, hostname, normalized_url, tranco_rank, rank_band, trigger_mode, status, scan_id, finding_count, reviewed_finding_count, average_agreement_score, error_message, created_at, started_at, completed_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (input?.status) {
    query = query.eq("status", input.status);
  }
  if (input?.rankBand) {
    query = query.eq("rank_band", input.rankBand);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw new Error(`Failed to load validation runs: ${error.message}`);
  }

  return {
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / limit)),
    rows: (data ?? []) as Array<Record<string, unknown>>,
    totalCount: count ?? 0
  };
}

export async function getValidationRunDetail(runId: string) {
  await requireValidationAdminContext();
  const supabase = createAdminClient();
  const { data: run, error: runError } = await supabase
    .from("validation_runs")
    .select(
      "id, hostname, normalized_url, tranco_rank, rank_band, trigger_mode, status, scan_id, finding_count, reviewed_finding_count, average_agreement_score, error_message, created_at, started_at, completed_at"
    )
    .eq("id", runId)
    .maybeSingle();

  if (runError) {
    throw new Error(`Failed to load validation run ${runId}: ${runError.message}`);
  }

  if (!run) {
    return null;
  }

  const { data: findings, error: findingsError } = await supabase
    .from("validation_run_findings")
    .select(
      "id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, finding_rank, evidence_json, validation_verdicts ( verdict, confidence, rationale, agreement_score, model, prompt_version, evidence_json, created_at )"
    )
    .eq("validation_run_id", runId)
    .order("finding_rank", { ascending: true });

  if (findingsError) {
    throw new Error(`Failed to load validation findings ${runId}: ${findingsError.message}`);
  }

  return {
    findings: (findings ?? []) as Array<Record<string, unknown>>,
    run: run as Record<string, unknown>
  };
}

export async function getValidationIssueAnalytics() {
  await requireValidationAdminContext();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_run_findings")
    .select("rule_key, title, finding_family, validation_verdicts ( verdict, agreement_score )");

  if (error) {
    throw new Error(`Failed to load validation issue analytics: ${error.message}`);
  }

  const analytics = new Map<
    string,
    {
      findingFamily: string | null;
      notSupportedCount: number;
      reviewedCount: number;
      ruleKey: string;
      supportedCount: number;
      title: string;
      totalFlagged: number;
      totalScore: number;
      inconclusiveCount: number;
    }
  >();

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const ruleKey = String(row.rule_key);
    const title = String(row.title ?? ruleKey);
    const findingFamily = typeof row.finding_family === "string" ? row.finding_family : null;
    const entry = analytics.get(ruleKey) ?? {
      findingFamily,
      inconclusiveCount: 0,
      notSupportedCount: 0,
      reviewedCount: 0,
      ruleKey,
      supportedCount: 0,
      title,
      totalFlagged: 0,
      totalScore: 0
    };
    entry.totalFlagged += 1;

    const verdictRows = Array.isArray(row.validation_verdicts)
      ? (row.validation_verdicts as Array<Record<string, unknown>>)
      : row.validation_verdicts
        ? [row.validation_verdicts as Record<string, unknown>]
        : [];
    const verdict = verdictRows[0]?.verdict;
    const agreementScore = Number(verdictRows[0]?.agreement_score ?? 0);

    if (verdict === "supported") {
      entry.supportedCount += 1;
      entry.reviewedCount += 1;
      entry.totalScore += agreementScore;
    } else if (verdict === "not_supported") {
      entry.notSupportedCount += 1;
      entry.reviewedCount += 1;
      entry.totalScore += agreementScore;
    } else if (verdict === "inconclusive") {
      entry.inconclusiveCount += 1;
      entry.reviewedCount += 1;
      entry.totalScore += agreementScore;
    }

    analytics.set(ruleKey, entry);
  }

  return [...analytics.values()]
    .map((entry) => ({
      averageAgreementScore:
        entry.reviewedCount > 0 ? Math.round((entry.totalScore / entry.reviewedCount) * 100) / 100 : null,
      findingFamily: entry.findingFamily,
      inconclusiveCount: entry.inconclusiveCount,
      notSupportedCount: entry.notSupportedCount,
      notSupportedRate: entry.reviewedCount > 0 ? entry.notSupportedCount / entry.reviewedCount : 0,
      reviewedCount: entry.reviewedCount,
      ruleKey: entry.ruleKey,
      supportedCount: entry.supportedCount,
      supportedRate: entry.reviewedCount > 0 ? entry.supportedCount / entry.reviewedCount : 0,
      title: entry.title,
      totalFlagged: entry.totalFlagged
    }))
    .sort((left, right) => right.reviewedCount - left.reviewedCount || left.supportedRate - right.supportedRate);
}

export async function createManualValidationRun(input: { targetId: string }) {
  const { user } = await requireValidationAdminContext();
  const settings = await ensureSettings();
  if (getPipelineState(settings) !== "running") {
    throw new Error("The validation pipeline is paused.");
  }

  const supabase = createAdminClient();
  const { data: target, error } = await supabase
    .from("validation_targets")
    .select("id, hostname, normalized_url, rank_band, tranco_rank, active, denylisted")
    .eq("id", input.targetId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load validation target: ${error.message}`);
  }

  if (!target || target.active !== true || target.denylisted === true) {
    throw new Error("This validation target cannot be started.");
  }

  const { data: activeRun } = await supabase
    .from("validation_runs")
    .select("id")
    .eq("validation_target_id", input.targetId)
    .in("status", ["queued", "collecting", "ranking", "validating"])
    .limit(1)
    .maybeSingle();

  if (activeRun) {
    throw new Error("This target already has an active validation run.");
  }

  const { data: run, error: runError } = await supabase
    .from("validation_runs")
    .insert({
      hostname: target.hostname,
      normalized_url: target.normalized_url,
      rank_band: target.rank_band,
      tranco_rank: target.tranco_rank,
      trigger_mode: "manual",
      status: "queued",
      validation_target_id: target.id
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create manual validation run: ${runError?.message ?? "Unknown error"}`);
  }

  await Promise.all([
    supabase.from("validation_targets").update({ last_run_at: new Date().toISOString(), last_status: "queued" }).eq("id", target.id),
    supabase.from("validation_audit_events").insert({
      actor_user_id: user.id,
      event_type: "manual_run_started",
      next_value_json: {
        targetId: target.id,
        validationRunId: run.id
      }
    })
  ]);

  return run.id as string;
}

export async function addValidationTarget(hostnameOrUrl: string) {
  const { user } = await requireValidationAdminContext();
  const normalizedUrl = normalizeUrl(hostnameOrUrl);
  const hostname = extractHostname(normalizedUrl);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_targets")
    .upsert(
      {
        active: true,
        hostname,
        normalized_url: normalizedUrl,
        source: "manual"
      },
      {
        onConflict: "hostname"
      }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to add validation target: ${error?.message ?? "Unknown error"}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: user.id,
    event_type: "target_added",
    next_value_json: {
      hostname,
      targetId: data.id
    }
  });

  return data.id as string;
}

export async function updateValidationControls(input: {
  automaticIntervalMinutes: number;
  operatorNote?: string | null;
  pipelineEnabled: boolean;
  runMode: ValidationRunMode;
  userId: string;
}) {
  if (!VALIDATION_INTERVAL_OPTIONS.includes(input.automaticIntervalMinutes as (typeof VALIDATION_INTERVAL_OPTIONS)[number])) {
    throw new Error("The selected automatic interval is not allowed.");
  }

  const supabase = createAdminClient();
  const previous = await ensureSettings();
  const { error } = await supabase
    .from("validation_settings")
    .update({
      automatic_interval_minutes: input.automaticIntervalMinutes,
      operator_note: input.operatorNote ?? null,
      pipeline_enabled: input.pipelineEnabled,
      run_mode: input.runMode,
      updated_by_user_id: input.userId
    })
    .eq("singleton", true);

  if (error) {
    throw new Error(`Failed to update validation controls: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: input.userId,
    event_type: "settings_updated",
    next_value_json: {
      automaticIntervalMinutes: input.automaticIntervalMinutes,
      operatorNote: input.operatorNote ?? null,
      pipelineEnabled: input.pipelineEnabled,
      runMode: input.runMode
    },
    previous_value_json: {
      automaticIntervalMinutes: previous.automatic_interval_minutes,
      operatorNote: previous.operator_note,
      pipelineEnabled: previous.pipeline_enabled,
      runMode: previous.run_mode
    }
  });
}

export async function updateValidationTargetState(input: {
  action: "clear_backoff" | "suppress" | "unsuppress";
  targetId: string;
  userId: string;
}) {
  const supabase = createAdminClient();
  const patch =
    input.action === "clear_backoff"
      ? { backoff_until: null }
      : input.action === "suppress"
        ? { deny_reason: "Suppressed by operator", denylisted: true }
        : { deny_reason: null, denylisted: false };

  const { error } = await supabase.from("validation_targets").update(patch).eq("id", input.targetId);
  if (error) {
    throw new Error(`Failed to update validation target: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: input.userId,
    event_type: `target_${input.action}`,
    next_value_json: {
      targetId: input.targetId,
      ...patch
    }
  });
}
