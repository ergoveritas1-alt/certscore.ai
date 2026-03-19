import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  SCAN_EVENT_TYPES,
  VALIDATION_DEFAULT_INTERVAL_MINUTES,
  VALIDATION_DEFAULT_RUN_MODE,
  type FindingCategory,
  type FindingSeverity,
  type ValidationPipelineState,
  type ValidationRunMode,
  type ValidationRunStatus,
  type ValidationVerdict
} from "@website-signal-risk-scanner/shared";
import { extractHostname, normalizeUrl } from "@website-signal-risk-scanner/shared";
import { getWorkerEnv } from "../env";
import { getCooldownDaysForRank, getNextDueAt, getRankBand, isValidValidationInterval, VALIDATION_FINDING_LIMIT, VALIDATION_SETTINGS_KEY } from "./constants";

type ValidationSettingsRow = {
  automatic_interval_minutes: number;
  last_scheduled_at: string | null;
  last_tranco_sync_at: string | null;
  next_due_at: string | null;
  operator_note: string | null;
  pipeline_enabled: boolean;
  run_mode: ValidationRunMode;
  singleton_key: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

type ValidationTargetRow = {
  active: boolean;
  backoff_until: string | null;
  cooldown_until: string | null;
  deny_reason: string | null;
  denylisted: boolean;
  hostname: string;
  id: string;
  last_completed_at: string | null;
  last_error: string | null;
  last_run_at: string | null;
  last_status: string | null;
  normalized_url: string;
  rank_band: string | null;
  tranco_rank: number | null;
};

type ValidationRunRow = {
  average_agreement_score: number | null;
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  error_message: string | null;
  finding_count: number;
  hostname: string;
  id: string;
  normalized_url: string;
  rank_band: string | null;
  reviewed_finding_count: number;
  scan_id: string | null;
  started_at: string | null;
  status: ValidationRunStatus;
  tranco_rank: number | null;
  trigger_mode: ValidationRunMode;
  validation_target_id: string | null;
};

export type ValidationRunRecord = {
  averageAgreementScore: number | null;
  completedAt: string | null;
  createdAt: string;
  domainId: string | null;
  errorMessage: string | null;
  findingCount: number;
  hostname: string;
  id: string;
  normalizedUrl: string;
  rankBand: string | null;
  reviewedFindingCount: number;
  scanId: string | null;
  startedAt: string | null;
  status: ValidationRunStatus;
  targetId: string | null;
  trancoRank: number | null;
  triggerMode: ValidationRunMode;
};

type ScanSignalRow = {
  category: "disclosure" | "privacy";
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[] | null;
  value_type: "boolean" | "number" | "text" | "string_array";
};

type ValidationSnapshotFallbackRow = {
  cookie_banner_present: boolean;
  dark_pattern_reject_button_missing: boolean;
  legal_coverage_score: number | null;
  preconsent_tracking_detected: boolean;
  privacy_policy_present: boolean;
  privacy_policy_word_count: number | null;
  reject_all_present: boolean;
  third_party_cookie_set_before_consent: boolean | null;
  tracking_before_consent_detected: boolean | null;
};

export type ValidationRunFindingInsert = {
  category: FindingCategory;
  description: string;
  evidence_json: Record<string, unknown>;
  finding_id: string | null;
  page_url: string | null;
  rank: number;
  rule_key: string;
  severity: FindingSeverity;
  subtype: string | null;
  title: string;
};

export type ValidationRunFindingRow = ValidationRunFindingInsert & {
  id: string;
  validation_run_id: string;
};

type ValidationRunFindingDbRow = Omit<ValidationRunFindingInsert, "rank"> & {
  finding_rank: number;
  id: string;
  validation_run_id: string;
};

export type ValidationVerdictInsert = {
  agreement_score: 0 | 50 | 100;
  confidence: number;
  evidence_json: Record<string, unknown>;
  model: string;
  prompt_version: string;
  rationale: string;
  validation_run_finding_id: string;
  verdict: ValidationVerdict;
};

const VALIDATION_SIGNAL_FINDING_DEFINITIONS: Record<
  string,
  {
    category: FindingCategory;
    description: string;
    severity: FindingSeverity;
    subtype: string | null;
    title: string;
  }
> = {
  "privacy.reject_control_missing_detected": {
    category: "privacy",
    description: "A consent experience was detected without a clear reject-all control.",
    severity: "high",
    subtype: "consent_controls",
    title: "Reject-all control missing"
  },
  "privacy.trackers_before_consent_detected": {
    category: "privacy",
    description: "Tracking activity appears to occur before the visitor can make a consent choice.",
    severity: "high",
    subtype: "preconsent_tracking",
    title: "Trackers observed before consent"
  },
  "disclosure.privacy_policy_limited": {
    category: "legal",
    description: "A privacy policy was detected, but its coverage appeared limited or incomplete.",
    severity: "medium",
    subtype: "policy_coverage",
    title: "Privacy policy coverage limited"
  },
  "disclosure.disclosure_language_missing_detected": {
    category: "legal",
    description: "Promotional or affiliate disclosure language appears to be missing.",
    severity: "high",
    subtype: "disclosure_language",
    title: "Disclosure language missing"
  }
};

function isActiveSignalValue(value: ScanSignalRow["signal_value_json"], valueType: ScanSignalRow["value_type"]) {
  if (valueType === "boolean") {
    return value === true;
  }

  if (valueType === "number") {
    return typeof value === "number" && value > 0;
  }

  if (valueType === "text") {
    return typeof value === "string" && value.trim().length > 0;
  }

  return Array.isArray(value) && value.length > 0;
}

function buildSnapshotFallbackFindings(snapshot: ValidationSnapshotFallbackRow): Omit<ValidationRunFindingInsert, "rank">[] {
  const findings: Omit<ValidationRunFindingInsert, "rank">[] = [];

  if (
    snapshot.preconsent_tracking_detected ||
    snapshot.tracking_before_consent_detected === true ||
    snapshot.third_party_cookie_set_before_consent === true
  ) {
    findings.push({
      category: "privacy",
      description: "Tracking activity appears to occur before the visitor can make a consent choice.",
      evidence_json: {
        source: "scan_snapshot_fallback",
        preconsentTrackingDetected: snapshot.preconsent_tracking_detected,
        thirdPartyCookieSetBeforeConsent: snapshot.third_party_cookie_set_before_consent,
        trackingBeforeConsentDetected: snapshot.tracking_before_consent_detected
      },
      finding_id: null,
      page_url: null,
      rule_key: "privacy.trackers_before_consent_detected",
      severity: "high",
      subtype: "preconsent_tracking",
      title: "Trackers observed before consent"
    });
  }

  if (
    snapshot.cookie_banner_present &&
    (!snapshot.reject_all_present || snapshot.dark_pattern_reject_button_missing)
  ) {
    findings.push({
      category: "privacy",
      description: "A consent experience was detected without a clear reject-all control.",
      evidence_json: {
        cookieBannerPresent: snapshot.cookie_banner_present,
        darkPatternRejectButtonMissing: snapshot.dark_pattern_reject_button_missing,
        rejectAllPresent: snapshot.reject_all_present,
        source: "scan_snapshot_fallback"
      },
      finding_id: null,
      page_url: null,
      rule_key: "privacy.reject_control_missing_detected",
      severity: "high",
      subtype: "consent_controls",
      title: "Reject-all control missing"
    });
  }

  if (
    snapshot.privacy_policy_present &&
    (
      (((snapshot.privacy_policy_word_count ?? 0) > 0) && ((snapshot.privacy_policy_word_count ?? 0) < 250)) ||
      (((snapshot.legal_coverage_score ?? 100) > 0) && ((snapshot.legal_coverage_score ?? 100) < 70))
    )
  ) {
    findings.push({
      category: "legal",
      description: "A privacy policy was detected, but its coverage appeared limited or incomplete.",
      evidence_json: {
        legalCoverageScore: snapshot.legal_coverage_score,
        privacyPolicyPresent: snapshot.privacy_policy_present,
        privacyPolicyWordCount: snapshot.privacy_policy_word_count,
        source: "scan_snapshot_fallback"
      },
      finding_id: null,
      page_url: null,
      rule_key: "disclosure.privacy_policy_limited",
      severity: "medium",
      subtype: "policy_coverage",
      title: "Privacy policy coverage limited"
    });
  }

  return findings;
}

function addDays(now: Date, days: number) {
  return new Date(now.getTime() + days * 24 * 60 * 60_000);
}

export async function insertValidationAuditEvent(input: {
  actorUserId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
  reason?: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("validation_audit_events").insert({
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    metadata_json: input.metadata ?? null,
    reason: input.reason ?? null
  });

  if (error) {
    throw new Error(`Failed to insert validation audit event: ${error.message}`);
  }
}

export async function ensureValidationSettings() {
  const supabase = createAdminClient();
  const env = getWorkerEnv();
  const { data, error } = await supabase
    .from("validation_settings")
    .upsert(
      {
        singleton_key: VALIDATION_SETTINGS_KEY,
        run_mode: env.VALIDATION_DEFAULT_RUN_MODE ?? VALIDATION_DEFAULT_RUN_MODE,
        automatic_interval_minutes: env.VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES ?? VALIDATION_DEFAULT_INTERVAL_MINUTES
      },
      { onConflict: "singleton_key" }
    )
    .select(
      "singleton_key, pipeline_enabled, run_mode, automatic_interval_minutes, updated_at, updated_by_user_id, operator_note, next_due_at, last_scheduled_at, last_tranco_sync_at"
    )
    .single();

  if (error || !data) {
    throw new Error(`Failed to load validation settings: ${error?.message ?? "Unknown error"}`);
  }

  const row = data as ValidationSettingsRow;
  if (!isValidValidationInterval(row.automatic_interval_minutes)) {
    const { error: updateError } = await supabase
      .from("validation_settings")
      .update({ automatic_interval_minutes: VALIDATION_DEFAULT_INTERVAL_MINUTES })
      .eq("singleton_key", VALIDATION_SETTINGS_KEY);

    if (updateError) {
      throw new Error(`Failed to normalize validation interval: ${updateError.message}`);
    }

    return {
      automaticIntervalMinutes: VALIDATION_DEFAULT_INTERVAL_MINUTES,
      lastScheduledAt: row.last_scheduled_at,
      lastTrancoSyncAt: row.last_tranco_sync_at,
      nextDueAt: row.next_due_at,
      operatorNote: row.operator_note,
      pipelineEnabled: row.pipeline_enabled,
      runMode: row.run_mode,
      updatedAt: row.updated_at,
      updatedByUserId: row.updated_by_user_id
    };
  }

  return {
    automaticIntervalMinutes: row.automatic_interval_minutes,
    lastScheduledAt: row.last_scheduled_at,
    lastTrancoSyncAt: row.last_tranco_sync_at,
    nextDueAt: row.next_due_at,
    operatorNote: row.operator_note,
    pipelineEnabled: row.pipeline_enabled,
    runMode: row.run_mode,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id
  };
}

export async function getValidationPipelineState(): Promise<ValidationPipelineState> {
  const env = getWorkerEnv();

  if (!env.VALIDATION_PIPELINE_ENABLED) {
    return "paused_by_env";
  }

  const settings = await ensureValidationSettings();
  return settings.pipelineEnabled ? "running" : "paused_by_admin";
}

export async function setValidationScheduleState(input: {
  lastScheduledAt?: Date | null;
  lastTrancoSyncAt?: Date | null;
  nextDueAt?: Date | null;
}) {
  const supabase = createAdminClient();
  const patch: Record<string, string | null> = {};

  if (input.lastScheduledAt !== undefined) {
    patch.last_scheduled_at = input.lastScheduledAt ? input.lastScheduledAt.toISOString() : null;
  }

  if (input.lastTrancoSyncAt !== undefined) {
    patch.last_tranco_sync_at = input.lastTrancoSyncAt ? input.lastTrancoSyncAt.toISOString() : null;
  }

  if (input.nextDueAt !== undefined) {
    patch.next_due_at = input.nextDueAt ? input.nextDueAt.toISOString() : null;
  }

  if (Object.keys(patch).length === 0) {
    return;
  }

  const { error } = await supabase.from("validation_settings").update(patch).eq("singleton_key", VALIDATION_SETTINGS_KEY);
  if (error) {
    throw new Error(`Failed to update validation scheduler state: ${error.message}`);
  }
}

export async function getActiveValidationRunCount() {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("validation_runs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "collecting", "ranking", "validating"]);

  if (error) {
    throw new Error(`Failed to count active validation runs: ${error.message}`);
  }

  return count ?? 0;
}

export async function getValidationRunById(validationRunId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_runs")
    .select(
      "id, validation_target_id, domain_id, scan_id, hostname, normalized_url, tranco_rank, rank_band, trigger_mode, status, error_message, finding_count, reviewed_finding_count, average_agreement_score, created_at, started_at, completed_at"
    )
    .eq("id", validationRunId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load validation run ${validationRunId}: ${error.message}`);
  }

  const row = (data as ValidationRunRow | null) ?? null;
  if (!row) {
    return null;
  }

  return {
    averageAgreementScore: row.average_agreement_score,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    domainId: row.domain_id,
    errorMessage: row.error_message,
    findingCount: row.finding_count,
    hostname: row.hostname,
    id: row.id,
    normalizedUrl: row.normalized_url,
    rankBand: row.rank_band,
    reviewedFindingCount: row.reviewed_finding_count,
    scanId: row.scan_id,
    startedAt: row.started_at,
    status: row.status,
    targetId: row.validation_target_id,
    trancoRank: row.tranco_rank,
    triggerMode: row.trigger_mode
  } satisfies ValidationRunRecord;
}

export async function updateValidationRun(
  validationRunId: string,
  patch: Partial<{
    average_agreement_score: number | null;
    completed_at: string | null;
    domain_id: string | null;
    error_message: string | null;
    finding_count: number;
    reviewed_finding_count: number;
    scan_id: string | null;
    started_at: string | null;
    status: ValidationRunStatus;
  }>
) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("validation_runs").update(patch).eq("id", validationRunId);
  if (error) {
    throw new Error(`Failed to update validation run ${validationRunId}: ${error.message}`);
  }
}

export async function updateValidationTargetAfterRun(input: {
  errorMessage?: string | null;
  hostname: string;
  lastStatus: ValidationRunStatus | "skipped";
  trancoRank: number | null;
}) {
  const supabase = createAdminClient();
  const { data: target, error: loadError } = await supabase
    .from("validation_targets")
    .select("id, consecutive_failures")
    .eq("hostname", input.hostname)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load validation target ${input.hostname}: ${loadError.message}`);
  }

  if (!target) {
    return;
  }

  const now = new Date();
  const consecutiveFailures =
    input.lastStatus === "completed" ? 0 : Number((target as { consecutive_failures?: number }).consecutive_failures ?? 0) + 1;
  const patch: Record<string, string | number | null> = {
    consecutive_failures: consecutiveFailures,
    last_completed_at: now.toISOString(),
    last_error: input.errorMessage ?? null,
    last_status: input.lastStatus
  };

  if (input.lastStatus === "completed") {
    patch.cooldown_until = addDays(now, getCooldownDaysForRank(input.trancoRank)).toISOString();
    patch.backoff_until = null;
  } else if (input.errorMessage && /(captcha|blocked|403|429|forbidden)/i.test(input.errorMessage)) {
    patch.backoff_until = addDays(now, 90).toISOString();
  } else if (input.lastStatus === "failed") {
    patch.backoff_until = addDays(now, Math.min(1 << Math.max(0, consecutiveFailures - 1), 14)).toISOString();
  }

  const { error } = await supabase.from("validation_targets").update(patch).eq("id", (target as { id: string }).id);
  if (error) {
    throw new Error(`Failed to update validation target ${input.hostname}: ${error.message}`);
  }
}

export async function createValidationRun(input: {
  hostname: string;
  normalizedUrl: string;
  targetId?: string | null;
  trancoRank?: number | null;
  triggerMode: ValidationRunMode;
  triggeredByUserId?: string | null;
}) {
  const supabase = createAdminClient();
  const rankBand = getRankBand(input.trancoRank ?? null);
  const { data, error } = await supabase
    .from("validation_runs")
    .insert({
      hostname: input.hostname,
      normalized_url: input.normalizedUrl,
      rank_band: rankBand,
      status: "queued",
      tranco_rank: input.trancoRank ?? null,
      trigger_mode: input.triggerMode,
      triggered_by_user_id: input.triggeredByUserId ?? null,
      validation_target_id: input.targetId ?? null
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation run for ${input.hostname}: ${error?.message ?? "Unknown error"}`);
  }

  return (data as { id: string }).id;
}

export async function getEligibleTargetForAutomaticRun(now = new Date()) {
  const supabase = createAdminClient();
  const activeTargetIds = new Set<string>();
  const { data: activeRuns, error: activeRunsError } = await supabase
    .from("validation_runs")
    .select("validation_target_id")
    .in("status", ["queued", "collecting", "ranking", "validating"]);

  if (activeRunsError) {
    throw new Error(`Failed to load active validation runs: ${activeRunsError.message}`);
  }

  for (const row of (activeRuns ?? []) as Array<{ validation_target_id: string | null }>) {
    if (row.validation_target_id) {
      activeTargetIds.add(row.validation_target_id);
    }
  }

  const bands = Object.entries({
    "1k-5k": 20,
    "5k-20k": 30,
    "20k-50k": 30,
    "50k-100k": 20
  });
  const random = Math.random() * 100;
  let cumulative = 0;
  let selectedBand = "5k-20k";
  for (const [band, weight] of bands) {
    cumulative += weight;
    if (random <= cumulative) {
      selectedBand = band;
      break;
    }
  }

  const candidateBands = [selectedBand, ...bands.map(([band]) => band).filter((band) => band !== selectedBand)];
  for (const band of candidateBands) {
    const { data, error } = await supabase
      .from("validation_targets")
      .select("id, hostname, normalized_url, active, denylisted, deny_reason, cooldown_until, backoff_until, tranco_rank, rank_band, last_run_at, last_completed_at, last_status, last_error")
      .eq("active", true)
      .eq("denylisted", false)
      .eq("rank_band", band)
      .order("tranco_rank", { ascending: true })
      .limit(500);

    if (error) {
      throw new Error(`Failed to load validation targets for band ${band}: ${error.message}`);
    }

    const eligible = ((data ?? []) as ValidationTargetRow[]).filter((target) => {
      if (activeTargetIds.has(target.id)) {
        return false;
      }

      const cooldownUntil = target.cooldown_until ? new Date(target.cooldown_until).getTime() : 0;
      const backoffUntil = target.backoff_until ? new Date(target.backoff_until).getTime() : 0;
      return cooldownUntil <= now.getTime() && backoffUntil <= now.getTime();
    });

    if (eligible.length === 0) {
      continue;
    }

    const selected = eligible[Math.floor(Math.random() * eligible.length)] ?? null;
    if (selected) {
      return {
        hostname: selected.hostname,
        id: selected.id,
        normalizedUrl: selected.normalized_url,
        rankBand: selected.rank_band,
        trancoRank: selected.tranco_rank
      };
    }
  }

  return null;
}

export async function upsertValidationTargets(rows: Array<{ hostname: string; normalizedUrl: string; trancoRank: number; source: string }>) {
  if (rows.length === 0) {
    return 0;
  }

  const supabase = createAdminClient();
  let inserted = 0;
  const batchSize = 500;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize).map((row) => ({
      active: true,
      hostname: row.hostname,
      normalized_url: row.normalizedUrl,
      rank_band: getRankBand(row.trancoRank),
      source: row.source,
      tranco_rank: row.trancoRank
    }));

    const { error } = await supabase.from("validation_targets").upsert(batch, { onConflict: "hostname" });
    if (error) {
      throw new Error(`Failed to upsert validation targets: ${error.message}`);
    }
    inserted += batch.length;
  }

  return inserted;
}

export async function markValidationTargetRunQueued(hostname: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("validation_targets")
    .update({ last_run_at: new Date().toISOString(), last_status: "queued", last_error: null })
    .eq("hostname", hostname);

  if (error) {
    throw new Error(`Failed to mark validation target ${hostname} as queued: ${error.message}`);
  }
}

export async function ensureAnonymousValidationDomain(hostname: string, normalizedUrl: string) {
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("domains")
    .select("id, hostname, normalized_url")
    .is("organization_id", null)
    .eq("normalized_url", normalizedUrl)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load validation domain ${normalizedUrl}: ${existingError.message}`);
  }

  if (existing) {
    return existing as { id: string; hostname: string; normalized_url: string };
  }

  const { data, error } = await supabase
    .from("domains")
    .insert({
      hostname,
      normalized_url: normalizedUrl
    })
    .select("id, hostname, normalized_url")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation domain ${hostname}: ${error?.message ?? "Unknown error"}`);
  }

  return data as { id: string; hostname: string; normalized_url: string };
}

export async function createValidationScan(input: {
  domainId: string;
  hostname: string;
  normalizedUrl: string;
  pagesRequested?: number;
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
      pages_requested: pagesRequested,
      pages_scanned: 0,
      scan_config_json: scanConfig,
      scan_type: "full",
      status: "queued"
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation scan for ${input.hostname}: ${error?.message ?? "Unknown error"}`);
  }

  const scanId = (data as { id: string }).id;
  const { error: domainError } = await supabase.from("domains").update({ latest_scan_id: scanId }).eq("id", input.domainId);
  if (domainError) {
    throw new Error(`Failed to set validation domain latest scan: ${domainError.message}`);
  }

  return scanId;
}

export async function insertValidationScanEvent(input: {
  domainId?: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  scanId?: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("scan_events").insert({
    domain_id: input.domainId ?? null,
    event_type: input.eventType,
    message: input.message,
    metadata_json: input.metadata ?? null,
    organization_id: null,
    scan_id: input.scanId ?? null
  });

  if (error) {
    throw new Error(`Failed to insert validation scan event: ${error.message}`);
  }
}

export async function loadRankableFindings(scanId: string) {
  const supabase = createAdminClient();
  const { data: findings, error } = await supabase
    .from("scan_signals")
    .select("category, signal_key, signal_label, signal_value_json, value_type")
    .eq("scan_id", scanId)
    .in("category", ["privacy", "disclosure"]);

  if (error) {
    throw new Error(`Failed to load validation findings for scan ${scanId}: ${error.message}`);
  }

  const rows = (findings ?? []) as ScanSignalRow[];

  if (rows.length === 0) {
    const { data: snapshot, error: snapshotError } = await supabase
      .from("scan_snapshots")
      .select(
        "cookie_banner_present, reject_all_present, dark_pattern_reject_button_missing, preconsent_tracking_detected, tracking_before_consent_detected, third_party_cookie_set_before_consent, privacy_policy_present, privacy_policy_word_count, legal_coverage_score"
      )
      .eq("scan_id", scanId)
      .maybeSingle();

    if (snapshotError) {
      throw new Error(`Failed to load validation snapshot fallback for scan ${scanId}: ${snapshotError.message}`);
    }

    if (snapshot) {
      return buildSnapshotFallbackFindings(snapshot as ValidationSnapshotFallbackRow);
    }

    return [];
  }

  return rows
    .filter(
      (row): row is ScanSignalRow & { signal_key: keyof typeof VALIDATION_SIGNAL_FINDING_DEFINITIONS } =>
        row.signal_key in VALIDATION_SIGNAL_FINDING_DEFINITIONS
    )
    .filter((row) => isActiveSignalValue(row.signal_value_json, row.value_type))
    .map((row) => {
      const definition = VALIDATION_SIGNAL_FINDING_DEFINITIONS[row.signal_key]!;

      return {
        category: definition.category,
        description: definition.description,
        evidence_json: {
          signalCategory: row.category,
          signalKey: row.signal_key,
          signalLabel: row.signal_label,
          signalValue: row.signal_value_json
        },
        finding_id: null,
        page_url: null,
        rule_key: row.signal_key,
        severity: definition.severity,
        subtype: definition.subtype,
        title: definition.title
      };
    });
}

export async function replaceValidationRunFindings(validationRunId: string, findings: ValidationRunFindingInsert[]) {
  const supabase = createAdminClient();
  const { error: deleteError } = await supabase.from("validation_run_findings").delete().eq("validation_run_id", validationRunId);
  if (deleteError) {
    throw new Error(`Failed to clear validation run findings: ${deleteError.message}`);
  }

  if (findings.length === 0) {
    return [] as ValidationRunFindingRow[];
  }

  const { data, error } = await supabase
    .from("validation_run_findings")
    .insert(findings.map(({ rank, ...finding }) => ({ ...finding, finding_rank: rank, rank, validation_run_id: validationRunId })))
    .select("id, validation_run_id, category, subtype, rule_key, title, description, severity, page_url, evidence_json, finding_rank");

  if (error) {
    throw new Error(`Failed to insert validation run findings: ${error.message}`);
  }

  return ((data ?? []) as ValidationRunFindingDbRow[]).map((row) => ({
    ...row,
    rank: row.finding_rank
  }));
}

export async function listValidationRunFindings(validationRunId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_run_findings")
    .select("id, validation_run_id, category, subtype, rule_key, title, description, severity, page_url, evidence_json, finding_rank")
    .eq("validation_run_id", validationRunId)
    .order("finding_rank", { ascending: true })
    .limit(VALIDATION_FINDING_LIMIT);

  if (error) {
    throw new Error(`Failed to load validation run findings for ${validationRunId}: ${error.message}`);
  }

  return ((data ?? []) as ValidationRunFindingDbRow[]).map((row) => ({
    ...row,
    rank: row.finding_rank
  }));
}

export async function replaceValidationVerdict(input: ValidationVerdictInsert) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("validation_verdicts")
    .upsert({ ...input }, { onConflict: "validation_run_finding_id" });

  if (error) {
    throw new Error(`Failed to upsert validation verdict: ${error.message}`);
  }
}

export async function summarizeValidationRun(validationRunId: string) {
  const supabase = createAdminClient();
  const { data: runFindings, error: findingsError } = await supabase
    .from("validation_run_findings")
    .select("id")
    .eq("validation_run_id", validationRunId);

  if (findingsError) {
    throw new Error(`Failed to load validation run findings for summary ${validationRunId}: ${findingsError.message}`);
  }

  const findingIds = ((runFindings ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (findingIds.length === 0) {
    await updateValidationRun(validationRunId, {
      average_agreement_score: null,
      completed_at: new Date().toISOString(),
      reviewed_finding_count: 0,
      status: "completed"
    });
    return;
  }

  const { data, error } = await supabase
    .from("validation_verdicts")
    .select("agreement_score")
    .in("validation_run_finding_id", findingIds);

  if (error) {
    throw new Error(`Failed to summarize validation run ${validationRunId}: ${error.message}`);
  }

  const verdicts = (data ?? []) as Array<{ agreement_score: number }>;
  const averageAgreementScore =
    verdicts.length > 0 ? Math.round(verdicts.reduce((sum, verdict) => sum + Number(verdict.agreement_score ?? 0), 0) / verdicts.length) : null;

  await updateValidationRun(validationRunId, {
    average_agreement_score: averageAgreementScore,
    completed_at: new Date().toISOString(),
    reviewed_finding_count: verdicts.length,
    status: "completed"
  });
}

export function normalizeValidationTargetUrl(input: string) {
  const normalizedUrl = normalizeUrl(input);
  return {
    hostname: extractHostname(normalizedUrl),
    normalizedUrl
  };
}

export function buildNextDueAt(intervalMinutes: number, from = new Date()) {
  return getNextDueAt({ from, intervalMinutes });
}
