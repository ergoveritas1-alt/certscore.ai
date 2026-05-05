import { randomUUID } from "node:crypto";
import { getWritePool, query, queryOne } from "@website-signal-risk-scanner/db";
import type { PoolClient } from "pg";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import {
  VALIDATION_INTERNAL_ORG_SLUG,
  VALIDATION_INTERVAL_OPTIONS,
  VALIDATION_RANK_BANDS,
  type ValidationAgreementScore,
  type ValidationRunMode
} from "@website-signal-risk-scanner/validation-shared";
import {
  buildSharedFullScanConfig,
  extractHostname,
  getCrawlerProductToken,
  getCrawlerPublicUrl,
  getPlanDefinition,
  normalizeUrl,
  type BlockPageClassification,
  type FinancialValidationEvidence,
  type PopulatedSignalRecord,
  type SignalPopulationStatus
} from "@website-signal-risk-scanner/shared";
import { deriveRetryPolicy } from "../../../../packages/shared/src/access-limitations";
import { getPrimaryCategoryDescription, getPrimaryCategoryLabel, mapSignalKeyToTaxonomy } from "../../../web/lib/scans/signal-taxonomy";
import { buildMergedSignalRecords } from "../../../web/lib/scans/merged-signals";
import {
  buildNanoPolicyInputsFromDocumentSources,
  mergeNanoPolicyInputsWithFallback,
  shouldPreferNanoDocumentSources
} from "../../../web/lib/scans/nano-document-sources";
import { buildNanoPolicySignalRows, MANAGED_NANO_POLICY_SIGNAL_KEYS } from "../../../web/lib/scans/nano-policy-signals";
import { repairFindingFamilyPacketEvents } from "../../../web/server/scans/family-packet-event-repair";
import type { ScanValidationFinding } from "../../../web/lib/scans/validation-review-linking";
import { getWorkerEnv } from "../env";
import { buildValidationWorkerCrawlerHeaders } from "../web-bot-auth";

const VALIDATION_SETTINGS_KEY = "default";

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

type ValidationRunRow = {
  completed_at: string | null;
  created_at: string;
  error_message: string | null;
  hostname: string;
  id: string;
  normalized_url: string;
  rank_band: string | null;
  scan_id: string | null;
  started_at: string | null;
  status: "queued" | "waiting_for_scan" | "collecting" | "ranking" | "validating" | "completed" | "failed";
  tranco_rank: number | null;
  trigger_mode: ValidationRunMode;
  updated_at?: string;
  validation_target_id: string | null;
};

type ValidationRunFindingWithVerdictRow = {
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

type SignalPopulationRow = {
  category: string | null;
  confidence?: number | null;
  evidence_refs?: string[] | null;
  observed_at?: string | null;
  population_source?: string | null;
  population_status?: string | null;
  provenance_json?: unknown;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[];
  value_type: string;
};

type NanoDocRetrievalInput = {
  discoveryCandidates: Array<Record<string, unknown>>;
  domainHostname: string | null;
  existingDocumentSources: Array<Record<string, unknown>>;
  pages: Array<Record<string, unknown>>;
  recentDomainDocumentCandidates: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  scan: {
    completed_at?: string | null;
    created_at?: string | null;
    error_message?: string | null;
    id?: string;
    scan_type?: string | null;
    started_at?: string | null;
    status?: string | null;
  } | null;
};

const ACTIVE_RUN_STATUSES = ["queued", "waiting_for_scan", "collecting", "ranking", "validating"] as const;
const TRANCO_SOURCE_FALLBACK_URL = "https://tranco-list.eu/latest_list";
const VALIDATION_WORKER_LOCK_NAMESPACE = 41017;
const NANO_SIGNAL_SCAN_LOCK_NAMESPACE = 41018;
const VALIDATION_COLLECT_RECHECK_MS = 15_000;

export type ValidationRunLease = {
  client: PoolClient;
  run: ValidationRunRow;
};

export type NanoSignalScanLease = {
  client: PoolClient;
  recovered: boolean;
  scanId: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown database error.";
}

function isMissingOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

function isRecoverableOptionalLoadError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return isMissingOptionalTableError(error) || message.includes("TypeError: fetch failed");
}

export function sanitizeJsonPersistenceValue<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(
      /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      "\uFFFD"
    ) as T;
  }

  if (typeof value === "number") {
    return (Number.isFinite(value) ? value : null) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonPersistenceValue(entry)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizeJsonPersistenceValue(entry)])
    ) as T;
  }

  return value;
}

export function prepareScanDocumentSourceRows(rows: Array<Record<string, unknown>>, scanId: string) {
  const now = new Date().toISOString();
  return rows.map((row) => ({
    ...sanitizeJsonPersistenceValue(row),
    created_at: typeof row.created_at === "string" ? row.created_at : now,
    id: typeof row.id === "string" && row.id.length > 0 ? row.id : randomUUID(),
    scan_id: scanId,
    updated_at: now
  }));
}

export function extractFallbackFinancialEvidenceFromRuntimeArtifacts(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const summary = runtimeArtifacts?.key_page_discovery_summary;
  if (!summary || typeof summary !== "object") {
    return {
      pageEvidence: [] as Array<Record<string, unknown>>,
      signalHits: [] as Array<Record<string, unknown>>
    };
  }

  const financialValidationEvidence = (summary as { financialValidationEvidence?: FinancialValidationEvidence | null })
    .financialValidationEvidence;

  if (!financialValidationEvidence) {
    return {
      pageEvidence: [] as Array<Record<string, unknown>>,
      signalHits: [] as Array<Record<string, unknown>>
    };
  }

  return {
    pageEvidence: financialValidationEvidence.pageEvidence.map((evidence) => ({
      evidence_id: evidence.evidenceId,
      matched_text: evidence.matchedText,
      metadata: evidence.metadata,
      page_role: evidence.pageRole,
      page_type: evidence.pageType,
      page_url: evidence.pageUrl
    })) as Array<Record<string, unknown>>,
    signalHits: financialValidationEvidence.signalHits.map((hit) => ({
      evidence_refs: hit.evidenceRefs,
      id: hit.id,
      page_role: hit.pageRole,
      page_type: hit.pageType,
      page_url: hit.pageUrl,
      payload: hit.payload,
      signal_key: hit.signalKey
    })) as Array<Record<string, unknown>>
  };
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined, column: string) {
  const message = error?.message ?? "";
  return message.includes(`Could not find the '${column}' column`) || message.includes(`column "${column}"`);
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function buildStoredSignalPopulationRecords(input: {
  observedAt: string | null;
  rows: SignalPopulationRow[];
  source: "nano" | "validation";
}): PopulatedSignalRecord[] {
  return input.rows.map((row) => ({
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    evidenceRefs: Array.isArray(row.evidence_refs) ? row.evidence_refs.filter((value): value is string => typeof value === "string") : [],
    key: row.signal_key,
    label: row.signal_label,
    observedAt: row.observed_at ?? input.observedAt,
    populationStatus: (
      row.population_status === "present" ||
      row.population_status === "missing" ||
      row.population_status === "conflicting" ||
      row.population_status === "insufficient"
        ? row.population_status
        : "present"
    ) as SignalPopulationStatus,
    provenance: Array.isArray(row.provenance_json)
      ? row.provenance_json.filter(
          (
            value
          ): value is { detail: string; kind: "document" | "runtime" | "signal" | "validation" } =>
            Boolean(value) &&
            typeof value === "object" &&
            typeof (value as { detail?: unknown }).detail === "string" &&
            ((value as { kind?: unknown }).kind === "document" ||
              (value as { kind?: unknown }).kind === "runtime" ||
              (value as { kind?: unknown }).kind === "signal" ||
              (value as { kind?: unknown }).kind === "validation")
        )
      : [],
    reportSignalSource: "document_semantic_signal" as const,
    source: input.source,
    value: row.signal_value_json,
    valueType:
      row.value_type === "boolean" || row.value_type === "number" || row.value_type === "text" || row.value_type === "string_array"
        ? row.value_type
        : Array.isArray(row.signal_value_json)
          ? "string_array"
          : typeof row.signal_value_json === "boolean"
            ? "boolean"
            : typeof row.signal_value_json === "number"
              ? "number"
              : "text"
  }));
}

function rankBandForRank(rank: number | null) {
  if (!rank) {
    return VALIDATION_RANK_BANDS[VALIDATION_RANK_BANDS.length - 1]?.key ?? null;
  }

  const match = VALIDATION_RANK_BANDS.find((band) => rank >= band.min && rank <= band.max);
  return match?.key ?? VALIDATION_RANK_BANDS[VALIDATION_RANK_BANDS.length - 1]?.key ?? null;
}

function addMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60_000);
}

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 86_400_000);
}

export async function ensureValidationSettings() {
  const env = getWorkerEnv();
  let existing: ValidationSettingsRow | null;
  try {
    existing = await queryOne<ValidationSettingsRow>(
      `
        select
          automatic_interval_minutes,
          last_scheduled_at,
          last_tranco_sync_at,
          next_due_at,
          operator_note,
          pipeline_enabled,
          run_mode,
          updated_at,
          updated_by_user_id
        from validation_settings
        where singleton_key = $1
      `,
      [VALIDATION_SETTINGS_KEY],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation settings: ${getErrorMessage(error)}`);
  }

  if (existing) {
    return existing;
  }

  const inserted = await queryOne<ValidationSettingsRow>(
    `
      insert into validation_settings (
        singleton_key,
        pipeline_enabled,
        run_mode,
        automatic_interval_minutes
      )
      values ($1, true, $2, $3)
      returning
        automatic_interval_minutes,
        last_scheduled_at,
        last_tranco_sync_at,
        next_due_at,
        operator_note,
        pipeline_enabled,
        run_mode,
        updated_at,
        updated_by_user_id
    `,
    [VALIDATION_SETTINGS_KEY, env.VALIDATION_DEFAULT_RUN_MODE, env.VALIDATION_DEFAULT_SAMPLE_INTERVAL_MINUTES]
  );

  if (!inserted) {
    throw new Error("Failed to initialize validation settings: Unknown error");
  }

  return inserted;
}

export async function getValidationPipelineState() {
  const env = getWorkerEnv();
  const settings = await ensureValidationSettings();

  if (!env.VALIDATION_PIPELINE_ENABLED) {
    return {
      settings,
      state: "paused_by_env" as const
    };
  }

  if (!settings.pipeline_enabled) {
    return {
      settings,
      state: "paused_by_admin" as const
    };
  }

  return {
    settings,
    state: "running" as const
  };
}

async function getValidationInternalOrganizationId() {
  let data: { id: string } | null;
  try {
    data = await queryOne<{ id: string }>(
      `
        select id
        from organizations
        where slug = $1
      `,
      [VALIDATION_INTERNAL_ORG_SLUG],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation internal organization: ${getErrorMessage(error)}`);
  }

  if (!data?.id) {
    throw new Error("Validation internal organization is missing.");
  }

  return data.id as string;
}

export async function upsertValidationTarget(input: {
  normalizedUrl: string;
  source: string;
  trancoRank?: number | null;
}) {
  const hostname = extractHostname(input.normalizedUrl);
  const trancoRank = input.trancoRank ?? null;
  const rankBand = rankBandForRank(trancoRank);

  const data = await queryOne<ValidationTargetRow>(
    `
      insert into validation_targets (
        hostname,
        normalized_url,
        source,
        tranco_rank,
        rank_band,
        active
      )
      values ($1, $2, $3, $4, $5, true)
      on conflict (hostname) do update
        set normalized_url = excluded.normalized_url,
            source = excluded.source,
            tranco_rank = excluded.tranco_rank,
            rank_band = excluded.rank_band,
            active = excluded.active
      returning
        active,
        backoff_until,
        cooldown_until,
        deny_reason,
        denylisted,
        failure_count,
        hostname,
        id,
        last_completed_at,
        last_error,
        last_run_at,
        last_status,
        normalized_url,
        rank_band,
        source,
        tranco_rank
    `,
    [hostname, input.normalizedUrl, input.source, trancoRank, rankBand]
  );

  if (!data) {
    throw new Error(`Failed to upsert validation target ${hostname}: Unknown error`);
  }

  return data;
}

export async function listValidationTargets(limit = 50) {
  try {
    return await query<ValidationTargetRow>(
      `
        select
          active,
          backoff_until,
          cooldown_until,
          deny_reason,
          denylisted,
          failure_count,
          hostname,
          id,
          last_completed_at,
          last_error,
          last_run_at,
          last_status,
          normalized_url,
          rank_band,
          source,
          tranco_rank
        from validation_targets
        order by last_run_at desc nulls last, tranco_rank asc nulls last
        limit $1
      `,
      [limit],
      { readOnly: true }
    ).then((result) => result.rows);
  } catch (error) {
    throw new Error(`Failed to list validation targets: ${getErrorMessage(error)}`);
  }
}

export async function syncTrancoTargets(force = false) {
  const env = getWorkerEnv();
  const settings = await ensureValidationSettings();
  const lastSyncAt = settings.last_tranco_sync_at ? new Date(settings.last_tranco_sync_at) : null;
  const now = new Date();

  if (!force && lastSyncAt && now.getTime() - lastSyncAt.getTime() < 24 * 60 * 60 * 1000) {
    return { insertedCount: 0, skipped: true as const };
  }

  const sourceUrl = env.VALIDATION_TRANCO_SOURCE_URL ?? TRANCO_SOURCE_FALLBACK_URL;
  const sourceRequest = buildValidationWorkerCrawlerHeaders(sourceUrl);
  console.info("[validation-worker] crawler request", sourceRequest.metadata);
  const response = await fetch(sourceUrl, { headers: sourceRequest.headers });

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
    const csvRequest = buildValidationWorkerCrawlerHeaders(csvUrl);
    console.info("[validation-worker] crawler request", csvRequest.metadata);
    const csvResponse = await fetch(csvUrl, { headers: csvRequest.headers });

    if (!csvResponse.ok) {
      throw new Error(`Failed to fetch Tranco CSV: ${csvResponse.status}`);
    }

    body = await csvResponse.text();
  }

  const lines = body.split(/\r?\n/);
  const rows: Array<{ active: boolean; hostname: string; normalized_url: string; rank_band: string | null; source: string; tranco_rank: number }> = [];

  for (const line of lines) {
    if (!line) {
      continue;
    }

    const [rankText, hostText] = line.split(",");
    const rank = Number(rankText);
    const hostname = hostText?.trim().toLowerCase();
    if (!Number.isFinite(rank) || !hostname) {
      continue;
    }
    if (rank < env.VALIDATION_TRANCO_MIN_RANK || rank > env.VALIDATION_TRANCO_MAX_RANK) {
      continue;
    }

    try {
      rows.push({
        active: true,
        hostname,
        normalized_url: normalizeUrl(hostname),
        rank_band: rankBandForRank(rank),
        source: "tranco",
        tranco_rank: rank
      });
    } catch {
      continue;
    }
  }

  let insertedCount = 0;
  const batchSize = 500;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    try {
      await query(
        `
          insert into validation_targets (
            active,
            hostname,
            normalized_url,
            rank_band,
            source,
            tranco_rank
          )
          select
            value->>'active' = 'true',
            value->>'hostname',
            value->>'normalized_url',
            value->>'rank_band',
            value->>'source',
            (value->>'tranco_rank')::int
          from jsonb_array_elements($1::jsonb) as value
          on conflict (hostname) do update
            set active = excluded.active,
                normalized_url = excluded.normalized_url,
                rank_band = excluded.rank_band,
                source = excluded.source,
                tranco_rank = excluded.tranco_rank
        `,
        [JSON.stringify(batch)]
      );
    } catch (error) {
      throw new Error(`Failed to upsert Tranco targets: ${getErrorMessage(error)}`);
    }

    insertedCount += batch.length;
  }

  await query(
    `
      update validation_settings
         set last_tranco_sync_at = $2
       where singleton_key = $1
    `,
    [VALIDATION_SETTINGS_KEY, now.toISOString()]
  );

  return { insertedCount, skipped: false as const };
}

function pickWeightedBand() {
  const roll = Math.random() * 100;
  let threshold = 0;

  for (const band of VALIDATION_RANK_BANDS) {
    threshold += band.weight;
    if (roll <= threshold) {
      return band.key;
    }
  }

  return VALIDATION_RANK_BANDS[0].key;
}

export async function claimNextAutomaticTarget(now = new Date()) {
  const nowIso = now.toISOString();
  const attemptedBands = [pickWeightedBand(), ...VALIDATION_RANK_BANDS.map((band) => band.key)].filter(
    (value, index, values) => values.indexOf(value) === index
  );

  for (const rankBand of attemptedBands) {
    let rows: ValidationTargetRow[];
    try {
      rows = await query<ValidationTargetRow>(
        `
          select
            active,
            backoff_until,
            cooldown_until,
            deny_reason,
            denylisted,
            failure_count,
            hostname,
            id,
            last_completed_at,
            last_error,
            last_run_at,
            last_status,
            normalized_url,
            rank_band,
            source,
            tranco_rank
          from validation_targets
          where active = true
            and denylisted = false
            and rank_band = $1
            and (cooldown_until is null or cooldown_until < $2)
            and (backoff_until is null or backoff_until < $2)
          limit 250
        `,
        [rankBand, nowIso],
        { readOnly: true }
      ).then((result) => result.rows);
    } catch (error) {
      throw new Error(`Failed to load validation targets: ${getErrorMessage(error)}`);
    }

    const eligibleRows = rows.filter((target) => {
      const cooldownOk = !target.cooldown_until || new Date(target.cooldown_until) <= now;
      const backoffOk = !target.backoff_until || new Date(target.backoff_until) <= now;
      return cooldownOk && backoffOk;
    });

    if (eligibleRows.length === 0) {
      continue;
    }

    const shuffled = [...eligibleRows].sort(() => Math.random() - 0.5);

    for (const target of shuffled) {
      let activeRun: { id: string } | null;
      try {
        activeRun = await queryOne<{ id: string }>(
          `
            select id
            from validation_runs
            where validation_target_id = $1
              and status = any($2::text[])
            limit 1
          `,
          [target.id, [...ACTIVE_RUN_STATUSES]],
          { readOnly: true }
        );
      } catch (error) {
        throw new Error(`Failed to check active validation runs: ${getErrorMessage(error)}`);
      }

      if (!activeRun) {
        return target;
      }
    }
  }

  return null;
}

export async function createValidationRun(input: {
  hostname: string;
  normalizedUrl: string;
  rankBand?: string | null;
  targetId?: string | null;
  trancoRank?: number | null;
  triggerMode: ValidationRunMode;
}) {
  const data = await queryOne<ValidationRunRow>(
    `
      insert into validation_runs (
        hostname,
        normalized_url,
        rank_band,
        tranco_rank,
        trigger_mode,
        status,
        validation_target_id
      )
      values ($1, $2, $3, $4, $5, 'queued', $6)
      returning
        completed_at,
        created_at,
        error_message,
        hostname,
        id,
        normalized_url,
        rank_band,
        scan_id,
        started_at,
        status,
        tranco_rank,
        trigger_mode,
        validation_target_id
    `,
    [input.hostname, input.normalizedUrl, input.rankBand ?? null, input.trancoRank ?? null, input.triggerMode, input.targetId ?? null]
  );

  if (!data) {
    throw new Error("Failed to create validation run: Unknown error");
  }

  if (input.targetId) {
    await query(
      `
        update validation_targets
           set last_run_at = $2,
               last_status = 'queued'
         where id = $1
      `,
      [input.targetId, new Date().toISOString()]
    );
  }

  return data;
}

export async function claimNextValidationRunLease(limit = 20): Promise<ValidationRunLease | null> {
  const client = await getWritePool().connect();

  try {
    const result = await client.query<ValidationRunRow>(
      `
        select
          completed_at,
          created_at,
          error_message,
          hostname,
          id,
          normalized_url,
          rank_band,
          scan_id,
          started_at,
          status,
          tranco_rank,
          trigger_mode,
          updated_at,
          validation_target_id
        from validation_runs
        where
          status in ('queued', 'waiting_for_scan', 'collecting', 'ranking', 'validating')
          and (
            status in ('queued', 'ranking', 'validating')
            or (
              status in ('waiting_for_scan', 'collecting')
              and updated_at <= timezone('utc', now()) - ($1::text)::interval
            )
          )
        order by
          case status
            when 'queued' then 1
            when 'ranking' then 2
            when 'validating' then 3
            when 'waiting_for_scan' then 4
            when 'collecting' then 5
            else 99
          end,
          updated_at asc,
          created_at asc
        limit $2
      `,
      [`${Math.ceil(VALIDATION_COLLECT_RECHECK_MS / 1000)} seconds`, limit]
    );

    for (const run of result.rows) {
      const lockResult = await client.query<{ locked: boolean }>(
        `select pg_try_advisory_lock($1, hashtext($2)) as locked`,
        [VALIDATION_WORKER_LOCK_NAMESPACE, run.id]
      );

      if (lockResult.rows[0]?.locked) {
        return {
          client,
          run
        };
      }
    }

    client.release();
    return null;
  } catch (error) {
    client.release();
    throw error;
  }
}

export async function releaseValidationRunLease(lease: ValidationRunLease) {
  try {
    await lease.client.query(`select pg_advisory_unlock($1, hashtext($2))`, [VALIDATION_WORKER_LOCK_NAMESPACE, lease.run.id]);
  } finally {
    lease.client.release();
  }
}

export async function claimNextNanoSignalScanLease(limit = 20): Promise<NanoSignalScanLease | null> {
  const client = await getWritePool().connect();

  try {
    const result = await client.query<{ recovered: boolean; requested_at: string; scan_id: string }>(
      `
        with requested as (
          select scan_id, max(created_at) as requested_at, false as recovered
          from scan_events
          where event_type = $1
            and scan_id is not null
          group by scan_id
        ),
        recovered as (
          select
            scans.id as scan_id,
            coalesce(scans.completed_at, scans.updated_at, scans.created_at) as requested_at,
            true as recovered
          from scans
          where scans.status = 'completed'
            and coalesce(scans.completed_at, scans.updated_at, scans.created_at) >= now() - interval '24 hours'
            and not exists (
              select 1
              from scan_events requested
              where requested.scan_id = scans.id
                and requested.event_type = $1
            )
            and not exists (
              select 1
              from scan_events terminal
              where terminal.scan_id = scans.id
                and terminal.event_type in ($2, $3)
            )
        ),
        candidates as (
          select scan_id, requested_at, recovered from requested
          union all
          select scan_id, requested_at, recovered from recovered
        )
        select candidates.scan_id, candidates.requested_at, candidates.recovered
        from candidates
        where not exists (
          select 1
          from scan_events completed
          where completed.scan_id = candidates.scan_id
            and completed.event_type in ($2, $3)
            and completed.created_at >= candidates.requested_at
        )
        order by candidates.requested_at asc
        limit $4
      `,
      [
        SCAN_EVENT_TYPES.nanoSignalEnrichmentQueued,
        SCAN_EVENT_TYPES.nanoSignalEnrichmentCompleted,
        SCAN_EVENT_TYPES.nanoSignalEnrichmentFailed,
        limit
      ]
    );

    for (const row of result.rows) {
      const lockResult = await client.query<{ locked: boolean }>(
        `select pg_try_advisory_lock($1, hashtext($2)) as locked`,
        [NANO_SIGNAL_SCAN_LOCK_NAMESPACE, row.scan_id]
      );

      if (lockResult.rows[0]?.locked) {
        return {
          client,
          recovered: row.recovered,
          scanId: row.scan_id
        };
      }
    }

    client.release();
    return null;
  } catch (error) {
    client.release();
    throw error;
  }
}

export async function releaseNanoSignalScanLease(lease: NanoSignalScanLease) {
  try {
    await lease.client.query(`select pg_advisory_unlock($1, hashtext($2))`, [NANO_SIGNAL_SCAN_LOCK_NAMESPACE, lease.scanId]);
  } finally {
    lease.client.release();
  }
}

export async function getValidationRun(runId: string) {
  try {
    return await queryOne<ValidationRunRow>(
      `
        select
          completed_at,
          created_at,
          error_message,
          hostname,
          id,
          normalized_url,
          rank_band,
          scan_id,
          started_at,
          status,
          tranco_rank,
          trigger_mode,
          validation_target_id
        from validation_runs
        where id = $1
      `,
      [runId],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load validation run ${runId}: ${getErrorMessage(error)}`);
  }
}

export async function updateValidationRun(
  runId: string,
  patch: Record<string, unknown>
) {
  const entries = Object.entries(patch);
  if (entries.length === 0) {
    return;
  }

  const setClause = entries.map(([key], index) => `${key} = $${index + 1}`).join(", ");
  try {
    await query(
      `
        update validation_runs
           set ${setClause}
         where id = $${entries.length + 1}
      `,
      [...entries.map(([, value]) => value), runId]
    );
  } catch (error) {
    throw new Error(`Failed to update validation run ${runId}: ${getErrorMessage(error)}`);
  }
}

export async function createScanForValidationRun(runId: string) {
  const run = await getValidationRun(runId);
  const teamPlan = getPlanDefinition("team");

  if (!run) {
    throw new Error(`Validation run ${runId} was not found.`);
  }

  if (run.scan_id) {
    return run.scan_id;
  }

  const organizationId = await getValidationInternalOrganizationId();
  const normalizedUrl = run.normalized_url;
  const hostname = run.hostname;
  const domain = await queryOne<{ id: string; max_pages_override: number | null }>(
    `
      select id, max_pages_override
      from domains
      where organization_id = $1
        and hostname = $2
    `,
    [organizationId, hostname],
    { readOnly: true }
  );

  let domainId = domain?.id ?? null;

  if (!domainId) {
    const insertedDomain = await queryOne<{ id: string }>(
      `
        insert into domains (
          organization_id,
          hostname,
          normalized_url,
          status
        )
        values ($1, $2, $3, 'active')
        returning id
      `,
      [organizationId, hostname, normalizedUrl]
    );

    if (!insertedDomain) {
      throw new Error(`Failed to create validation domain ${hostname}: Unknown error`);
    }

    domainId = insertedDomain.id;
  } else {
    await query(
      `
        update domains
           set normalized_url = $2,
               status = 'active'
         where id = $1
      `,
      [domainId, normalizedUrl]
    );
  }

  const scan = await queryOne<{ id: string }>(
    `
      insert into scans (
        organization_id,
        domain_id,
        submitted_by_user_id,
        scan_type,
        status,
        pages_requested,
        pages_scanned,
        scan_config_json
      )
      values ($1, $2, null, 'full', 'queued', $3, 0, $4)
      returning id
    `,
    [
      organizationId,
      domainId,
      teamPlan.maxPagesPerScan,
      buildSharedFullScanConfig({
        crawlerIdentity: {
          productToken: getCrawlerProductToken(),
          publicUrl: getCrawlerPublicUrl()
        },
        maxPages: teamPlan.maxPagesPerScan,
        processor: "queued-full-scan-v1",
        profile: teamPlan.scanProfile,
        source: "validation-canary",
        triggerMode: run.trigger_mode
      })
    ]
  );

  if (!scan) {
    throw new Error(`Failed to create validation scan for ${hostname}: Unknown error`);
  }

  await Promise.all([
    query(`update domains set latest_scan_id = $2 where id = $1`, [domainId, scan.id]),
    query(
      `
        update validation_runs
           set scan_id = $2,
               status = 'collecting',
               started_at = $3,
               error_message = null
         where id = $1
      `,
      [runId, scan.id, new Date().toISOString()]
    ),
    run.validation_target_id
      ? query(
          `
            update validation_targets
               set last_run_at = $2,
                   last_status = 'collecting'
             where id = $1
          `,
          [run.validation_target_id, new Date().toISOString()]
        )
      : Promise.resolve()
  ]);

  return scan.id as string;
}

export async function loadCompletedScanArtifacts(scanId: string) {
  const optionalOne = <T extends Record<string, unknown>>(text: string, values: unknown[] = []) =>
    queryOne<T>(text, values, { readOnly: true })
      .then((data) => ({ data, error: null as { message?: string; code?: string | null } | null }))
      .catch((error) => ({ data: null as T | null, error: { message: getErrorMessage(error) } }));
  const optionalMany = <T extends Record<string, unknown>>(text: string, values: unknown[] = []) =>
    query<T>(text, values, { readOnly: true })
      .then((result) => ({ data: result.rows, error: null as { message?: string; code?: string | null } | null }))
      .catch((error) => ({ data: [] as T[], error: { message: getErrorMessage(error) } }));

  let scan: Record<string, unknown> | null;
  let snapshot: Record<string, unknown> | null;
  let runtimeArtifacts: Record<string, unknown> | null;
  let rawSignals: SignalPopulationRow[];
  let trackerVendors: Array<Record<string, unknown>>;
  let pages: Array<Record<string, unknown>>;
  let policyEnrichments: Array<Record<string, unknown>>;
  let documentSourcesResult: { data: Array<Record<string, unknown>>; error: { message?: string; code?: string | null } | null };
  let macroEnrichmentResult: { data: Record<string, unknown> | null; error: { message?: string; code?: string | null } | null };
  let policyReviewQueue: Array<Record<string, unknown>>;
  let preconsentResult: { data: Array<Record<string, unknown>>; error: { message?: string; code?: string | null } | null };
  let signalHitsResult: { data: Array<Record<string, unknown>>; error: { message?: string; code?: string | null } | null };
  let pageEvidenceResult: { data: Array<Record<string, unknown>>; error: { message?: string; code?: string | null } | null };
  let accessibilityRuleExamplesResult: { data: Array<Record<string, unknown>>; error: { message?: string; code?: string | null } | null };

  try {
    [
      scan,
      snapshot,
      runtimeArtifacts,
      rawSignals,
      trackerVendors,
      pages,
      policyEnrichments,
      documentSourcesResult,
      macroEnrichmentResult,
      policyReviewQueue,
      preconsentResult,
      signalHitsResult,
      pageEvidenceResult,
      accessibilityRuleExamplesResult
    ] = await Promise.all([
      queryOne<Record<string, unknown>>(
        `select id, status, created_at, completed_at, error_message from scans where id = $1`,
        [scanId],
        { readOnly: true }
      ),
      queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [scanId], { readOnly: true }),
      queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [scanId], { readOnly: true }),
      query<SignalPopulationRow>(
        `select category, signal_key, signal_label, signal_value_json, value_type, population_source, population_status, confidence, evidence_refs, provenance_json, observed_at
           from scan_signals
          where scan_id = $1
          order by category asc, signal_key asc`,
        [scanId],
        { readOnly: true }
      ).then((result) => result.rows),
      query<Record<string, unknown>>(
        `select vendor_name, vendor_category, confidence, detection_source, first_party_or_third_party, before_consent, script_host, matched_signature_id
           from scan_tracker_vendors
          where scan_id = $1
          order by vendor_name asc`,
        [scanId],
        { readOnly: true }
      ).then((result) => result.rows),
      query<Record<string, unknown>>(
        `select page_type, page_url, fetch_status
           from scan_pages
          where scan_id = $1
          order by page_type asc`,
        [scanId],
        { readOnly: true }
      ).then((result) => result.rows),
      query<Record<string, unknown>>(`select * from policy_enrichment where scan_id = $1`, [scanId], { readOnly: true }).then((result) => result.rows),
      optionalMany<Record<string, unknown>>(`select * from scan_document_sources where scan_id = $1 order by created_at asc`, [scanId]),
      optionalOne<Record<string, unknown>>(`select * from scan_macro_enrichments where scan_id = $1`, [scanId]),
      query<Record<string, unknown>>(
        `select id, policy_enrichment_id, reason, review_status, review_verdict, reviewer_notes, created_at, reviewed_at
           from policy_review_queue
          where scan_id = $1
          order by created_at asc`,
        [scanId],
        { readOnly: true }
      ).then((result) => result.rows),
      optionalMany<Record<string, unknown>>(
        `select vendor_name, evidence_urls, collection_endpoint_type
           from scan_preconsent_violations
          where scan_id = $1`,
        [scanId]
      ),
      optionalMany<Record<string, unknown>>(
        `select id, signal_key, page_url, page_type, page_role, evidence_refs, payload
           from scan_signal_hits
          where scan_id = $1
            and signal_key = any($2::text[])`,
        [
          scanId,
          [
            "financial.performance_claim_text_present",
            "financial.return_or_yield_percentage_present",
            "financial.investment_outperformance_language_present",
            "financial.guaranteed_return_language_present",
            "financial.low_risk_high_return_language_present",
            "financial.hypothetical_or_backtest_language_present",
            "financial.testimonial_or_review_block_near_financial_claim_present",
            "financial.risk_disclosure_text_present",
            "financial.claim_cta_block_present",
            "commercial.pricing_page_present",
            "commercial.fee_related_text_present",
            "commercial.explicit_fee_disclosure_text_present",
            "commercial.fee_schedule_table_present",
            "commercial.withdrawal_redemption_terms_text_present",
            "commercial.cancellation_terms_text_present",
            "commercial.account_closure_terms_text_present",
            "commercial.promo_price_or_free_claim_present",
            "commercial.variable_fee_language_present_without_explanation",
            "financial.apr_or_interest_rate_disclosure_text_present",
            "financial.past_performance_disclaimer_text_present"
          ]
        ]
      ),
      optionalMany<Record<string, unknown>>(
        `select evidence_id, page_url, page_type, page_role, matched_text, metadata
           from scan_page_evidence
          where scan_id = $1`,
        [scanId]
      ),
      optionalMany<Record<string, unknown>>(
        `select * from scan_accessibility_rule_examples where scan_id = $1 order by created_at asc`,
        [scanId]
      )
    ]);
  } catch (error) {
    throw new Error(`Failed to load validation scan ${scanId}: ${getErrorMessage(error)}`);
  }

  const documentSourcesError = documentSourcesResult.error;
  const macroEnrichmentError = macroEnrichmentResult.error;
  const preconsentError = preconsentResult.error;
  const signalHitsError = signalHitsResult.error;
  const pageEvidenceError = pageEvidenceResult.error;
  const accessibilityRuleExamplesError = accessibilityRuleExamplesResult.error;

  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load document sources ${scanId}: ${documentSourcesError.message}`);
  }
  if (macroEnrichmentError && !isMissingOptionalTableError(macroEnrichmentError)) {
    throw new Error(`Failed to load scan macro enrichment ${scanId}: ${macroEnrichmentError.message}`);
  }
  if (preconsentError && !isRecoverableOptionalLoadError(preconsentError)) {
    throw new Error(`Failed to load pre-consent violations ${scanId}: ${preconsentError.message}`);
  }
  if (signalHitsError && !isMissingOptionalTableError(signalHitsError)) {
    throw new Error(`Failed to load signal hits ${scanId}: ${signalHitsError.message}`);
  }
  if (pageEvidenceError && !isMissingOptionalTableError(pageEvidenceError)) {
    throw new Error(`Failed to load page evidence ${scanId}: ${pageEvidenceError.message}`);
  }
  if (accessibilityRuleExamplesError && !isMissingOptionalTableError(accessibilityRuleExamplesError)) {
    throw new Error(`Failed to load accessibility rule examples ${scanId}: ${accessibilityRuleExamplesError.message}`);
  }

  const runtimeArtifactsRecord = runtimeArtifacts ?? null;
  const rawSignalRows = rawSignals;
  const scannerSignalRows = rawSignalRows.filter((signal) => !signal.population_source || signal.population_source === "scanner");
  const storedNanoSignalRows = rawSignalRows.filter((signal) => signal.population_source === "nano");
  const storedValidationSignalRows = rawSignalRows.filter((signal) => signal.population_source === "validation");
  const fallbackFinancialEvidence = extractFallbackFinancialEvidenceFromRuntimeArtifacts(runtimeArtifactsRecord);
  const loadedPageEvidence = pageEvidenceError ? [] : pageEvidenceResult.data;
  const loadedSignalHits = signalHitsError ? [] : signalHitsResult.data;
  const normalizedDocumentSources = documentSourcesError ? [] : documentSourcesResult.data;
  const scannedHostname = typeof snapshot?.domain === "string" ? snapshot.domain : null;
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources, { scannedHostname });
  const fallbackPolicyRows = policyEnrichments;
  const policySemanticInputs = preferDocumentSources
    ? mergeNanoPolicyInputsWithFallback({
        documentSources: normalizedDocumentSources,
        fallbackRows: fallbackPolicyRows,
        scannedHostname
      })
    : fallbackPolicyRows;
  const mergedSignals = buildMergedSignalRecords({
    nanoSignals: buildStoredSignalPopulationRecords({
      observedAt: typeof scan?.completed_at === "string" ? scan.completed_at : null,
      rows: storedNanoSignalRows,
      source: "nano"
    }),
    scannerSignals: scannerSignalRows.map((signal) => ({
      confidence: typeof signal.confidence === "number" ? signal.confidence : null,
      evidenceRefs: Array.isArray(signal.evidence_refs) ? signal.evidence_refs.filter((value): value is string => typeof value === "string") : [],
      key: signal.signal_key,
      label: signal.signal_label,
      observedAt: signal.observed_at ?? (typeof scan?.completed_at === "string" ? scan.completed_at : null),
      populationStatus:
        signal.population_status === "present" ||
        signal.population_status === "missing" ||
        signal.population_status === "conflicting" ||
        signal.population_status === "insufficient"
          ? signal.population_status
          : "present",
      provenance: [],
      reportSignalSource: null,
      source: "scanner",
      value: signal.signal_value_json,
      valueType: signal.value_type === "boolean" || signal.value_type === "number" || signal.value_type === "text" || signal.value_type === "string_array"
        ? signal.value_type
        : Array.isArray(signal.signal_value_json)
          ? "string_array"
          : typeof signal.signal_value_json === "number"
            ? "number"
            : typeof signal.signal_value_json === "boolean"
              ? "boolean"
              : "text"
    })),
    validationSignals: buildStoredSignalPopulationRecords({
      observedAt: typeof scan?.completed_at === "string" ? scan.completed_at : null,
      rows: storedValidationSignalRows,
      source: "validation"
    })
  });

  return {
    accessibilityRuleExamples: accessibilityRuleExamplesError ? [] : accessibilityRuleExamplesResult.data,
    documentSources: normalizedDocumentSources,
    mergedSignals,
    pageEvidence: loadedPageEvidence.length > 0 ? loadedPageEvidence : fallbackFinancialEvidence.pageEvidence,
    pages,
    macroEnrichment: (macroEnrichmentError ? null : macroEnrichmentResult.data) ?? null,
    policyEnrichments: fallbackPolicyRows,
    policySemanticRows: policySemanticInputs,
    policySemanticInputs,
    policyReviewQueue,
    preferDocumentSources,
    preconsentViolations: preconsentError ? [] : preconsentResult.data,
    rawPolicyEnrichmentRows: fallbackPolicyRows,
    runtimeArtifacts: runtimeArtifactsRecord,
    scan: scan ?? null,
    signalHits: loadedSignalHits.length > 0 ? loadedSignalHits : fallbackFinancialEvidence.signalHits,
    snapshot: snapshot ?? null,
    trackerVendors
  };
}

export async function loadNanoSignalEnrichmentInputs(scanId: string) {
  const documentSourcesResult = await query<Record<string, unknown>>(
    `select * from scan_document_sources where scan_id = $1 order by created_at asc`,
    [scanId],
    { readOnly: true }
  )
    .then((result) => ({ data: result.rows, error: null as { message?: string; code?: string | null } | null }))
    .catch((error) => ({ data: [] as Array<Record<string, unknown>>, error: { message: getErrorMessage(error) } }));

  const [scan, snapshot, runtimeArtifacts, policyEnrichments, policyReviewQueue] = await Promise.all([
    queryOne<Record<string, unknown>>(`select id, status, scan_type, created_at, started_at, completed_at, error_message from scans where id = $1`, [scanId], { readOnly: true }),
    queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [scanId], { readOnly: true }),
    queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [scanId], { readOnly: true }),
    query<Record<string, unknown>>(`select * from policy_enrichment where scan_id = $1 order by created_at asc`, [scanId], { readOnly: true }).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from policy_review_queue where scan_id = $1 order by created_at asc`, [scanId], { readOnly: true }).then((result) => result.rows)
  ]);

  const documentSourcesError = documentSourcesResult.error;
  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load document sources for nano signal enrichment ${scanId}: ${documentSourcesError.message}`);
  }

  const normalizedDocumentSources = documentSourcesError ? [] : documentSourcesResult.data;
  const fallbackPolicyRows = policyEnrichments;
  const scannedHostname = typeof snapshot?.domain === "string" ? snapshot.domain : null;
  const documentBackedPolicyInputs = mergeNanoPolicyInputsWithFallback({
    documentSources: normalizedDocumentSources,
    fallbackRows: fallbackPolicyRows,
    scannedHostname
  });
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources, { scannedHostname });
  return {
    documentSources: normalizedDocumentSources,
    policySemanticRows: preferDocumentSources ? documentBackedPolicyInputs : fallbackPolicyRows,
    policySignalInputs: preferDocumentSources ? documentBackedPolicyInputs : fallbackPolicyRows,
    policyEnrichments: fallbackPolicyRows,
    policyReviewQueue,
    preferDocumentSources,
    rawPolicyEnrichmentRows: fallbackPolicyRows,
    runtimeArtifacts: runtimeArtifacts ?? null,
    scan: (scan as {
      completed_at?: string | null;
      created_at?: string | null;
      error_message?: string | null;
      id?: string;
      scan_type?: string | null;
      started_at?: string | null;
      status?: string | null;
    } | null) ?? null,
    snapshot: snapshot ?? null
  };
}

export async function loadNanoDocRetrievalInputs(scanId: string): Promise<NanoDocRetrievalInput> {
  const scan = await queryOne<Record<string, unknown>>(
    `select id, status, created_at, started_at, completed_at, error_message, domain_id from scans where id = $1`,
    [scanId],
    { readOnly: true }
  );

  const domainId = typeof scan?.domain_id === "string" ? scan.domain_id : null;
  const documentSourcesResult = await query<Record<string, unknown>>(
    `select * from scan_document_sources where scan_id = $1 order by created_at asc`,
    [scanId],
    { readOnly: true }
  )
    .then((result) => ({ data: result.rows, error: null as { message?: string; code?: string | null } | null }))
    .catch((error) => ({ data: [] as Array<Record<string, unknown>>, error: { message: getErrorMessage(error) } }));

  const [domain, pages, events, runtimeArtifacts, recentDomainScans] = await Promise.all([
    domainId
      ? queryOne<{ hostname: string }>(`select hostname from domains where id = $1`, [domainId], { readOnly: true })
      : Promise.resolve(null),
    query<Record<string, unknown>>(
      `select page_type, page_url, fetch_status
         from scan_pages
        where scan_id = $1
        order by page_type asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select event_type, metadata_json, created_at
         from scan_events
        where scan_id = $1
          and event_type = 'runtime.build_phase_diagnostic'
        order by created_at asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [scanId], { readOnly: true }),
    domainId
      ? query<Record<string, unknown>>(
          `
            select id
            from scans
            where domain_id = $1
              and id <> $2
            order by created_at desc
            limit 5
          `,
          [domainId, scanId],
          { readOnly: true }
        ).then((result) => result.rows)
      : Promise.resolve([] as Array<Record<string, unknown>>)
  ]);

  const documentSourcesError = documentSourcesResult.error;
  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load existing document sources for nano doc retrieval ${scanId}: ${documentSourcesError.message}`);
  }

  const recentDomainScanIds = recentDomainScans
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((value): value is string => typeof value === "string");
  const recentDomainDocumentCandidates =
    recentDomainScanIds.length > 0
      ? await query<Record<string, unknown>>(
          `
            select canonical_url, source_url, document_type, title, semantic_confidence, created_at
            from scan_document_sources
            where scan_id = any($1::uuid[])
              and source_status = 'ready'
            order by created_at desc
          `,
          [recentDomainScanIds],
          { readOnly: true }
        ).then((result) => result.rows)
      : [];

  const discoveryCandidates = events.flatMap((event) => {
    const metadata =
      event.metadata_json && typeof event.metadata_json === "object" && !Array.isArray(event.metadata_json)
        ? (event.metadata_json as Record<string, unknown>)
        : null;
    if (metadata?.phase !== "page_discovery_fetch") {
      return [];
    }

    const discoveryDebug =
      metadata.discoveryDebug && typeof metadata.discoveryDebug === "object" && !Array.isArray(metadata.discoveryDebug)
        ? (metadata.discoveryDebug as Record<string, unknown>)
        : null;
    const topCandidates = Array.isArray(discoveryDebug?.topDiscoveryCandidates)
      ? discoveryDebug.topDiscoveryCandidates.filter(
          (value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
        )
      : [];

    return topCandidates.map((candidate) => ({
      anchor_text: typeof candidate.anchorText === "string" ? candidate.anchorText : null,
      candidate_score:
        typeof candidate.candidateScore === "number"
          ? candidate.candidateScore
          : Number(candidate.candidateScore ?? 0),
      candidate_url: typeof candidate.candidateUrl === "string" ? candidate.candidateUrl : null,
      discovered_from: typeof candidate.discoveredFrom === "string" ? candidate.discoveredFrom : null,
      host_relation: typeof candidate.hostRelation === "string" ? candidate.hostRelation : null,
      page_type: typeof candidate.pageType === "string" ? candidate.pageType : null,
      source_url: typeof candidate.sourceUrl === "string" ? candidate.sourceUrl : null
    }));
  });

  return {
    discoveryCandidates,
    domainHostname: (domain?.hostname as string | null) ?? null,
    existingDocumentSources: documentSourcesError ? [] : documentSourcesResult.data,
    pages,
    recentDomainDocumentCandidates,
    runtimeArtifacts: runtimeArtifacts ?? null,
    scan:
      (scan as {
        completed_at?: string | null;
        created_at?: string | null;
        error_message?: string | null;
        id?: string;
        started_at?: string | null;
        status?: string | null;
      } | null) ?? null
  };
}

export async function replaceValidationRunFindings(
  runId: string,
  findings: Array<{
    category: string;
    subtype: string | null;
    findingFamily: string;
    findingSource: string;
    findingScope: string;
    findingSubject: string;
    ruleKey: string;
    title: string;
    description: string;
    severity: string;
    pageUrl: string | null;
    rank: number;
    evidence: Record<string, unknown>;
  }>
) {
  const run = await getValidationRun(runId);
  await query(`delete from validation_run_findings where validation_run_id = $1`, [runId]);

  if (findings.length === 0) {
    await updateValidationRun(runId, {
      finding_count: 0,
      reviewed_finding_count: 0
    });
    if (run?.scan_id) {
      await persistValidationRunReportFindingCount({
        runId,
        scanId: run.scan_id
      });
    }
    return [];
  }

  const baseRows = findings.map((finding) =>
    sanitizeJsonPersistenceValue({
      validation_run_id: runId,
      category: finding.category,
      subtype: finding.subtype,
      finding_family: finding.findingFamily,
      finding_source: finding.findingSource,
      finding_scope: finding.findingScope,
      finding_subject: finding.findingSubject,
      rule_key: finding.ruleKey,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      page_url: finding.pageUrl,
      finding_rank: finding.rank,
      evidence_json: finding.evidence
    })
  );

  let insertedRows: Array<Record<string, unknown>>;
  try {
    insertedRows = await query<Record<string, unknown>>(
      `
        insert into validation_run_findings (
          validation_run_id,
          category,
          subtype,
          finding_family,
          finding_source,
          finding_scope,
          finding_subject,
          rule_key,
          title,
          description,
          severity,
          page_url,
          finding_rank,
          evidence_json,
          rank
        )
        select
          (value->>'validation_run_id')::uuid,
          value->>'category',
          nullif(value->>'subtype', ''),
          value->>'finding_family',
          value->>'finding_source',
          value->>'finding_scope',
          value->>'finding_subject',
          value->>'rule_key',
          value->>'title',
          value->>'description',
          value->>'severity',
          nullif(value->>'page_url', ''),
          (value->>'finding_rank')::int,
          value->'evidence_json',
          (value->>'finding_rank')::int
        from jsonb_array_elements($1::jsonb) as value
        returning id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, finding_rank, evidence_json
      `,
      [JSON.stringify(baseRows)],
      { readOnly: false }
    ).then((result) => result.rows);
  } catch (error) {
    const message = getErrorMessage(error);
    if (!message.includes(`column "rank"`)) {
      throw new Error(`Failed to insert validation findings for run ${runId}: ${message}`);
    }

    insertedRows = await query<Record<string, unknown>>(
      `
        insert into validation_run_findings (
          validation_run_id,
          category,
          subtype,
          finding_family,
          finding_source,
          finding_scope,
          finding_subject,
          rule_key,
          title,
          description,
          severity,
          page_url,
          finding_rank,
          evidence_json
        )
        select
          (value->>'validation_run_id')::uuid,
          value->>'category',
          nullif(value->>'subtype', ''),
          value->>'finding_family',
          value->>'finding_source',
          value->>'finding_scope',
          value->>'finding_subject',
          value->>'rule_key',
          value->>'title',
          value->>'description',
          value->>'severity',
          nullif(value->>'page_url', ''),
          (value->>'finding_rank')::int,
          value->'evidence_json'
        from jsonb_array_elements($1::jsonb) as value
        returning id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, finding_rank, evidence_json
      `,
      [JSON.stringify(baseRows)],
      { readOnly: false }
    ).then((result) => result.rows);
  }

  await updateValidationRun(runId, {
    finding_count: findings.length
  });

  if (run?.scan_id) {
    await persistValidationRunReportFindingCount({
      runId,
      scanId: run.scan_id ?? ""
    });
  }

  return insertedRows;
}

export async function loadValidationRunFindings(runId: string) {
  try {
    return await query<Record<string, unknown>>(
      `
        select
          id,
          category,
          subtype,
          finding_family,
          finding_source,
          finding_scope,
          finding_subject,
          rule_key,
          title,
          description,
          severity,
          page_url,
          finding_rank,
          evidence_json
        from validation_run_findings
        where validation_run_id = $1
        order by finding_rank asc
      `,
      [runId],
      { readOnly: true }
    ).then((result) => result.rows);
  } catch (error) {
    throw new Error(`Failed to load validation findings for run ${runId}: ${getErrorMessage(error)}`);
  }
}

export async function upsertValidationVerdict(input: {
  agreementScore: ValidationAgreementScore;
  confidence: number;
  evidence: Record<string, unknown>;
  model: string;
  promptVersion: string;
  rationale: string;
  validationRunFindingId: string;
  verdict: "supported" | "inconclusive" | "not_supported";
}) {
  await query(
    `
      insert into validation_verdicts (
        validation_run_finding_id,
        verdict,
        confidence,
        rationale,
        agreement_score,
        model,
        prompt_version,
        evidence_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (validation_run_finding_id) do update
        set verdict = excluded.verdict,
            confidence = excluded.confidence,
            rationale = excluded.rationale,
            agreement_score = excluded.agreement_score,
            model = excluded.model,
            prompt_version = excluded.prompt_version,
            evidence_json = excluded.evidence_json
    `,
    [
      input.validationRunFindingId,
      input.verdict,
      input.confidence,
      input.rationale,
      input.agreementScore,
      input.model,
      input.promptVersion,
      JSON.stringify(sanitizeJsonPersistenceValue(input.evidence))
    ]
  );
}

export async function finalizeValidationRun(runId: string) {
  const run = await getValidationRun(runId);

  if (!run) {
    throw new Error(`Validation run ${runId} was not found.`);
  }

  const findingIds = await query<{ id: string }>(
    `
      select id
      from validation_run_findings
      where validation_run_id = $1
    `,
    [runId],
    { readOnly: true }
  ).then((result) => result.rows.map((row) => row.id));

  const verdicts = findingIds.length
    ? await query<{ agreement_score: number }>(
        `
          select agreement_score
          from validation_verdicts
          where validation_run_finding_id = any($1::uuid[])
        `,
        [findingIds],
        { readOnly: true }
      ).then((result) => result.rows)
    : [];

  const scores = verdicts.map((row) => row.agreement_score);
  const averageAgreementScore =
    scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
  const completedAt = new Date();
  const scanId = run.scan_id;

  if (!scanId) {
    return;
  }

  await updateValidationRun(runId, {
    average_agreement_score: averageAgreementScore,
    completed_at: completedAt.toISOString(),
    error_message: null,
    reviewed_finding_count: scores.length,
    status: "completed"
  });

  await persistValidationRunReportFindingCount({
    runId,
    scanId
  });

  const snapshot = await queryOne<{
    access_posture_class: string | null;
    auth_wall_suspected: boolean | null;
    blocked_flag: boolean | null;
    block_page_classification: BlockPageClassification | null;
    captcha_flag: boolean | null;
    challenge_suspected: boolean | null;
    cooldown_hours: number | null;
    homepage_fetch_status: string | null;
    homepage_fetch_http_status: number | null;
    normalized_body_hash: string | null;
    pages_scanned: number | null;
    rate_limit_suspected: boolean | null;
    robots_fetch_http_status: number | null;
    scan_outcome: string | null;
  }>(
    `
      select
        access_posture_class,
        auth_wall_suspected,
        blocked_flag,
        block_page_classification,
        captcha_flag,
        homepage_fetch_status,
        homepage_fetch_http_status,
        normalized_body_hash,
        pages_scanned,
        robots_fetch_http_status,
        challenge_suspected,
        rate_limit_suspected,
        scan_outcome,
        cooldown_hours
      from scan_snapshots
      where scan_id = $1
    `,
    [scanId],
    { readOnly: true }
  );
  const homepagePage = await queryOne<{
    normalized_content_hash: string | null;
    page_url: string | null;
    title_hash: string | null;
  }>(
    `
      select normalized_content_hash, title_hash, page_url
      from scan_pages
      where scan_id = $1
        and page_type = 'homepage'
      order by created_at asc
      limit 1
    `,
    [scanId],
    { readOnly: true }
  );

  const hasNormalizedHomepageBody = typeof snapshot?.normalized_body_hash === "string" && snapshot.normalized_body_hash.length > 0;
  const hasNormalizedHomepagePageContent =
    typeof homepagePage?.normalized_content_hash === "string" && homepagePage.normalized_content_hash.length > 0;
  const degradedContentCapture =
    !hasNormalizedHomepageBody &&
    !hasNormalizedHomepagePageContent &&
    snapshot?.homepage_fetch_status === "ok" &&
    snapshot?.homepage_fetch_http_status !== 401 &&
    snapshot?.homepage_fetch_http_status !== 403 &&
    snapshot?.homepage_fetch_http_status !== 429 &&
    (snapshot?.pages_scanned ?? 0) > 0 &&
    snapshot?.access_posture_class === "tolerant";

  if (degradedContentCapture) {
    await query(
      `
        update scan_snapshots
           set scan_outcome = 'content_capture_degraded',
               stop_reason_code = 'content_capture_degraded',
               stop_reason_label = 'Content capture degraded',
               stop_reason_detail = $2
         where scan_id = $1
      `,
      [
        scanId,
        "Homepage fetch succeeded, but the run did not retain a usable normalized homepage body for downstream review."
      ]
    );
    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.contentCaptureDegraded,
      message: "Snapshot marked as content-capture degraded after homepage content was not retained cleanly.",
      metadataJson: {
        accessPostureClass: snapshot?.access_posture_class ?? null,
        homepageFetchHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
        homepageFetchStatus: snapshot?.homepage_fetch_status ?? null,
        homepagePageUrl: homepagePage?.page_url ?? null,
        normalizedBodyMissing: true,
        normalizedHomepageContentMissing: true,
        pagesScanned: snapshot?.pages_scanned ?? null
      },
      scanId
    });
  }

  const effectiveScanOutcome = degradedContentCapture ? "content_capture_degraded" : snapshot?.scan_outcome ?? null;

  if (!run.validation_target_id) {
    return;
  }

  const cooldownDays = run.tranco_rank && run.tranco_rank <= 20_000 ? 14 : 30;

  const blocked =
    snapshot?.blocked_flag === true ||
    snapshot?.captcha_flag === true ||
    snapshot?.homepage_fetch_http_status === 403 ||
    snapshot?.homepage_fetch_http_status === 429 ||
    snapshot?.robots_fetch_http_status === 403 ||
    snapshot?.robots_fetch_http_status === 429 ||
    effectiveScanOutcome === "robots_restricted" ||
    effectiveScanOutcome === "unknown_access_limitation";
  const retryPolicy = deriveRetryPolicy({
    accessPostureClass: snapshot?.access_posture_class ?? null,
    authWallSuspected: snapshot?.auth_wall_suspected === true,
    blockPageClassification:
      typeof snapshot?.block_page_classification === "string" ? snapshot.block_page_classification : null,
    homepageFetchStatus: snapshot?.homepage_fetch_status ?? null,
    homepageHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
    normalizedBodyMissing: !snapshot?.normalized_body_hash,
    pagesScanned: snapshot?.pages_scanned ?? null,
    transportFailure: effectiveScanOutcome === "transport_failure" || effectiveScanOutcome === "timeout_navigation",
    challengeSuspected: snapshot?.challenge_suspected === true,
    rateLimitSuspected: snapshot?.rate_limit_suspected === true
  });
  const blockedCooldownHours =
    typeof snapshot?.cooldown_hours === "number" && Number.isFinite(snapshot.cooldown_hours)
      ? snapshot.cooldown_hours
      : retryPolicy.cooldownHours;

  await query(
    `
      update validation_targets
         set backoff_until = $2,
             cooldown_until = $3,
             last_completed_at = $4,
             last_error = null,
             last_status = 'completed'
       where id = $1
    `,
    [
      run.validation_target_id,
      blocked ? addDays(completedAt, 90).toISOString() : null,
      blocked
        ? new Date(completedAt.getTime() + blockedCooldownHours * 60 * 60 * 1000).toISOString()
        : retryPolicy.retryRecommended
          ? new Date(completedAt.getTime() + retryPolicy.cooldownHours * 60 * 60 * 1000).toISOString()
        : addDays(completedAt, cooldownDays).toISOString(),
      completedAt.toISOString()
    ]
  );
}

async function persistValidationRunReportFindingCount(input: {
  runId: string;
  scanId: string;
}) {
  try {
    const detailViewModulePath = "../../../web/components/scans/shared-scan-detail-view";
    const [detailViewModule] = await Promise.all([import(detailViewModulePath)]);
    const resolvedDetailViewModule = (
      detailViewModule as {
        default?: Record<string, unknown>;
        "module.exports"?: Record<string, unknown>;
        buildScanReportUnifiedFindings?: unknown;
      }
    ).buildScanReportUnifiedFindings
      ? (detailViewModule as Record<string, unknown>)
      : (
          detailViewModule as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          detailViewModule as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (detailViewModule as Record<string, unknown>);
    const buildScanReportUnifiedFindings = (
      resolvedDetailViewModule as {
        buildScanReportUnifiedFindings?: (scanRecord: Record<string, unknown>) => Array<Record<string, unknown>>;
      }
    ).buildScanReportUnifiedFindings;

    if (typeof buildScanReportUnifiedFindings !== "function") {
      throw new Error("shared-scan-detail-view did not export buildScanReportUnifiedFindings");
    }

    const scanRecord = await loadScanRecordForFindingCount({
      runId: input.runId,
      scanId: input.scanId
    });

    if (!scanRecord) {
      return;
    }

    const reportFindingCount = buildScanReportUnifiedFindings(scanRecord).length;
    await query(
      `
        update scan_snapshots
           set report_finding_count = $2
         where scan_id = $1
      `,
      [input.scanId, reportFindingCount]
    );
  } catch (error) {
    console.error("[validation-worker] failed to compute report finding count", {
      error: error instanceof Error ? error.message : String(error),
      runId: input.runId,
      scanId: input.scanId
    });
  }
}

async function loadScanRecordForFindingCount(input: {
  runId: string;
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
    query<SignalPopulationRow>(
      `select category, signal_key, signal_label, signal_value_json, value_type, population_source, population_status, confidence, evidence_refs, provenance_json, observed_at
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
    query<ValidationRunFindingWithVerdictRow>(
      `select id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json
         from validation_run_findings
        where validation_run_id = $1`,
      [input.runId],
      { readOnly: true }
    ).then((result) => result.rows)
  ]);

  const validationFindingBaseRows = validationFindingRows;
  const validationFindingIds = validationFindingBaseRows.map((row) => row.id);
  const verdictByFindingId = new Map<string, ValidationVerdictRow>();

  if (validationFindingIds.length > 0) {
    const verdictRows = await query<ValidationVerdictRow>(
      `
        select
          validation_run_finding_id,
          verdict,
          confidence,
          rationale,
          agreement_score,
          model,
          prompt_version,
          system_confidence_score,
          system_confidence_band,
          system_confidence_explanation
        from validation_verdicts
        where validation_run_finding_id = any($1::uuid[])
        order by created_at desc
      `,
      [validationFindingIds],
      { readOnly: true }
    ).then((result) => result.rows);

    for (const row of verdictRows) {
      if (!verdictByFindingId.has(row.validation_run_finding_id)) {
        verdictByFindingId.set(row.validation_run_finding_id, row);
      }
    }
  }

  const rawSignalRows = (signals ?? []) as SignalPopulationRow[];
  const scannerSignalRows = rawSignalRows.filter((signal) => !signal.population_source || signal.population_source === "scanner");
  const storedNanoSignalRows = rawSignalRows.filter((signal) => signal.population_source === "nano");
  const storedValidationSignalRows = rawSignalRows.filter((signal) => signal.population_source === "validation");
  const normalizedDocumentSources = (documentSources ?? []) as Array<Record<string, unknown>>;
  const scannedHostname = typeof snapshot?.domain === "string" ? snapshot.domain : null;
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources, { scannedHostname });
  const fallbackPolicyRows = ((policyEnrichment ?? []) as Array<Record<string, unknown>>);
  const policySemanticRows = preferDocumentSources
    ? mergeNanoPolicyInputsWithFallback({
        documentSources: normalizedDocumentSources,
        fallbackRows: fallbackPolicyRows,
        scannedHostname
      })
    : fallbackPolicyRows;
  const normalizedPolicyRows = policySemanticRows.map((row, index) => {
    const next = { ...row };
    if (typeof next.id !== "string") {
      next.id = typeof row.source_document_id === "string" ? row.source_document_id : `document-semantic-${index + 1}`;
    }
    delete next.created_at;
    delete next.updated_at;
    return next;
  });
  const normalizedSignals = scannerSignalRows.map((signal) => {
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

  const repairedEvents = repairFindingFamilyPacketEvents({
    events: ((events ?? []) as Array<Record<string, unknown>>).map((event) => ({
      id: String(event.id ?? ""),
      eventType: String(event.event_type ?? ""),
      message: typeof event.message === "string" ? event.message : "",
      metadataJson: (event.metadata_json as Record<string, unknown> | null) ?? undefined,
      createdAt: String(event.created_at ?? "")
    })),
    policyEnrichment: normalizedPolicyRows
  });

  const validationFindings: ScanValidationFinding[] = validationFindingBaseRows.map((row) => {
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
    accessibilityRuleCounts: (accessibilityRuleCounts ?? []) as Array<Record<string, unknown>>,
    accessibilityRuleExamples: (accessibilityRuleExamples ?? []) as Array<Record<string, unknown>>,
    events: repairedEvents,
    policyEnrichment: normalizedPolicyRows,
    policyReviewQueue: ((policyReviewQueue ?? []) as Array<Record<string, unknown>>).map((row) => {
      const next = { ...row };
      delete next.created_at;
      delete next.updated_at;
      return next;
    }),
    preconsentViolations: (preconsentViolations ?? []) as Array<Record<string, unknown>>,
    runtimeArtifacts: (runtimeArtifacts as Record<string, unknown> | null) ?? null,
    mergedSignals: buildMergedSignalRecords({
      nanoSignals: buildStoredSignalPopulationRecords({
        observedAt: typeof snapshot?.completed_at === "string" ? snapshot.completed_at : null,
        rows: storedNanoSignalRows,
        source: "nano"
      }),
      validationSignals: buildStoredSignalPopulationRecords({
        observedAt: typeof snapshot?.completed_at === "string" ? snapshot.completed_at : null,
        rows: storedValidationSignalRows,
        source: "validation"
      })
    }),
    signals: normalizedSignals,
    snapshot: (snapshot as Record<string, unknown> | null) ?? null,
    trackerVendors: (trackerVendors ?? []) as Array<Record<string, unknown>>,
    validationFindings
  };
}

export async function failValidationRun(runId: string, message: string) {
  const run = await getValidationRun(runId);
  const failedAt = new Date();

  await updateValidationRun(runId, {
    completed_at: failedAt.toISOString(),
    error_message: message,
    status: "failed"
  });

  if (!run?.validation_target_id) {
    return;
  }

  const target = await queryOne<{ failure_count: number | null }>(
    `select failure_count from validation_targets where id = $1`,
    [run.validation_target_id],
    { readOnly: true }
  );
  const failureCount = Number(target?.failure_count ?? 0) + 1;
  const backoffDays = Math.min(30, 2 ** Math.min(failureCount - 1, 4));

  await query(
    `
      update validation_targets
         set backoff_until = $2,
             failure_count = $3,
             last_error = $4,
             last_status = 'failed'
       where id = $1
    `,
    [run.validation_target_id, addDays(failedAt, backoffDays).toISOString(), failureCount, message]
  );
}

export async function markValidationSchedule(input: {
  nextDueAt: Date;
  now: Date;
}) {
  await query(
    `
      update validation_settings
         set last_scheduled_at = $2,
             next_due_at = $3
       where singleton_key = $1
    `,
    [VALIDATION_SETTINGS_KEY, input.now.toISOString(), input.nextDueAt.toISOString()]
  );
}

export async function replaceScanDocumentSources(input: {
  rows: Array<Record<string, unknown>>;
  scanId: string;
}) {
  try {
    await query(
      `delete from scan_document_sources where scan_id = $1 and source = 'nano_doc_retrieval'`,
      [input.scanId]
    );
  } catch (error) {
    const message = getErrorMessage(error);
    const shaped = { message };
    if (!isMissingOptionalTableError(shaped)) {
      throw new Error(`Failed to clear document sources for scan ${input.scanId}: ${message}`);
    }
  }

  const nanoOwnedRows = input.rows.filter((row) => {
    const source = typeof row.source === "string" ? row.source : typeof row.sourceSource === "string" ? row.sourceSource : null;
    return source === "nano_doc_retrieval";
  });

  if (nanoOwnedRows.length === 0) {
    return [];
  }

  await query(
    `
      insert into scan_document_sources
      select *
      from jsonb_populate_recordset(null::scan_document_sources, $1::jsonb)
    `,
    [JSON.stringify(prepareScanDocumentSourceRows(nanoOwnedRows, input.scanId))]
  );

  return nanoOwnedRows;
}

export async function appendScanDocumentSources(input: {
  rows: Array<Record<string, unknown>>;
  scanId: string;
}) {
  if (input.rows.length === 0) {
    return [];
  }

  await query(
    `
      insert into scan_document_sources
      select *
      from jsonb_populate_recordset(null::scan_document_sources, $1::jsonb)
    `,
    [JSON.stringify(prepareScanDocumentSourceRows(input.rows, input.scanId))]
  );

  return input.rows;
}

export async function updateScanDocumentSourceExtractions(input: {
  rows: Array<{
    extractedFields: Record<string, unknown>;
    extractionStatus: "ready" | "insufficient" | "failed";
    id: string;
    metadata?: Record<string, unknown>;
    semanticConfidence: number | null;
  }>;
}) {
  for (const row of input.rows) {
    await query(
      `
        update scan_document_sources
           set extracted_fields_json = $2,
               extraction_status = $3,
               metadata_json = $4,
               semantic_confidence = $5,
               updated_at = $6
         where id = $1
      `,
      [
        row.id,
        sanitizeJsonPersistenceValue(row.extractedFields),
        row.extractionStatus,
        sanitizeJsonPersistenceValue(row.metadata ?? {}),
        row.semanticConfidence,
        new Date().toISOString()
      ]
    );
  }
}

export async function loadReusableNanoDocumentExtractions(input: {
  rows: Array<Record<string, unknown>>;
  scanId: string;
}) {
  const canonicalUrls = [...new Set(
    input.rows
      .map((row) => (typeof row.canonical_url === "string" && row.canonical_url.trim().length > 0 ? row.canonical_url.trim() : null))
      .filter((value): value is string => typeof value === "string")
  )];
  const documentTypes = [...new Set(
    input.rows
      .map((row) => (typeof row.document_type === "string" && row.document_type.trim().length > 0 ? row.document_type.trim() : null))
      .filter((value): value is string => typeof value === "string")
  )];

  if (canonicalUrls.length === 0 && documentTypes.length === 0) {
    return [] as Array<Record<string, unknown>>;
  }

  const [exactUrlResult, recentTypeResult] = await Promise.all([
    canonicalUrls.length === 0
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null as { message?: string; code?: string | null } | null })
      : query<Record<string, unknown>>(
          `
            select *
            from scan_document_sources
            where canonical_url = any($1::text[])
              and extraction_status = 'ready'
              and scan_id <> $2
            order by updated_at desc
          `,
          [canonicalUrls, input.scanId],
          { readOnly: true }
        )
          .then((result) => ({ data: result.rows, error: null as { message?: string; code?: string | null } | null }))
          .catch((error) => ({ data: [] as Array<Record<string, unknown>>, error: { message: getErrorMessage(error) } })),
    documentTypes.length === 0
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null as { message?: string; code?: string | null } | null })
      : query<Record<string, unknown>>(
          `
            select *
            from scan_document_sources
            where document_type = any($1::text[])
              and extraction_status = 'ready'
              and scan_id <> $2
            order by updated_at desc
            limit 250
          `,
          [documentTypes, input.scanId],
          { readOnly: true }
        )
          .then((result) => ({ data: result.rows, error: null as { message?: string; code?: string | null } | null }))
          .catch((error) => ({ data: [] as Array<Record<string, unknown>>, error: { message: getErrorMessage(error) } }))
  ]);

  if (exactUrlResult.error && !isMissingOptionalTableError(exactUrlResult.error)) {
    throw new Error(`Failed to load reusable document source extractions by canonical url for scan ${input.scanId}: ${exactUrlResult.error.message}`);
  }
  if (recentTypeResult.error && !isMissingOptionalTableError(recentTypeResult.error)) {
    throw new Error(`Failed to load reusable document source extractions by document type for scan ${input.scanId}: ${recentTypeResult.error.message}`);
  }

  const deduped = new Map<string, Record<string, unknown>>();
  for (const row of ([...(exactUrlResult.data ?? []), ...(recentTypeResult.data ?? [])] as Array<Record<string, unknown>>)) {
    const id = typeof row.id === "string" ? row.id : null;
    if (id && !deduped.has(id)) {
      deduped.set(id, row);
    }
  }

  return [...deduped.values()].filter((row) => {
    const metadata = typeof row.metadata_json === "object" && row.metadata_json !== null && !Array.isArray(row.metadata_json)
      ? (row.metadata_json as Record<string, unknown>)
      : {};
    const contentHash = typeof metadata.content_hash === "string" ? metadata.content_hash : null;
    return typeof contentHash === "string" && contentHash.length > 0;
  });
}

export async function persistDerivedNanoPolicySignals(input: {
  policySemanticRows: Array<Record<string, unknown>>;
  policyReviewQueue?: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  scanId: string;
  snapshot?: Record<string, unknown> | null;
}) {
  const nextRows = buildNanoPolicySignalRows({
    policyEnrichments: input.policySemanticRows,
    policyReviewQueue: input.policyReviewQueue,
    runtimeArtifacts: input.runtimeArtifacts,
    snapshot: input.snapshot
  });
  const scanRow = await queryOne<{ domain_id: string | null; organization_id: string | null }>(
    `select organization_id, domain_id from scans where id = $1`,
    [input.scanId],
    { readOnly: true }
  );

  if (!scanRow?.domain_id) {
    throw new Error(`Failed to load scan ownership for nano policy signals ${input.scanId}: missing scan`);
  }

  const nextKeys = new Set(nextRows.map((row) => row.key));
  const managedKeysToDelete = [...MANAGED_NANO_POLICY_SIGNAL_KEYS].filter((key) => !nextKeys.has(key));
  if (managedKeysToDelete.length > 0) {
    await query(
      `
        delete from scan_signals
        where scan_id = $1
          and population_source = 'nano'
          and signal_key = any($2::text[])
      `,
      [input.scanId, managedKeysToDelete]
    );
  }

  if (nextRows.length === 0) {
    return nextRows;
  }

  const observedAt = new Date().toISOString();

  await query(
    `
      insert into scan_signals (
        category,
        confidence,
        domain_id,
        evidence_refs,
        observed_at,
        organization_id,
        population_source,
        population_status,
        provenance_json,
        scan_id,
        signal_key,
        signal_label,
        signal_value_json,
        value_type
      )
      select
        value->>'category',
        nullif(value->>'confidence', '')::float8,
        nullif(value->>'domain_id', '')::uuid,
        coalesce(array(select jsonb_array_elements_text(value->'evidence_refs')), ARRAY[]::text[]),
        $2::timestamptz,
        nullif(value->>'organization_id', '')::uuid,
        value->>'population_source',
        value->>'population_status',
        value->'provenance_json',
        nullif(value->>'scan_id', '')::uuid,
        value->>'signal_key',
        value->>'signal_label',
        value->'signal_value_json',
        value->>'value_type'
      from jsonb_array_elements($1::jsonb) as value
      on conflict (scan_id, signal_key, population_source) do update
        set category = excluded.category,
            confidence = excluded.confidence,
            domain_id = excluded.domain_id,
            evidence_refs = excluded.evidence_refs,
            observed_at = excluded.observed_at,
            organization_id = excluded.organization_id,
            population_status = excluded.population_status,
            provenance_json = excluded.provenance_json,
            signal_label = excluded.signal_label,
            signal_value_json = excluded.signal_value_json,
            value_type = excluded.value_type
    `,
    [
      JSON.stringify(
        nextRows.map((row) => ({
          category:
            row.key.startsWith("commerce.") ? "commerce" :
            row.key.startsWith("disclosure.") ? "disclosure" :
            row.key.startsWith("accessibility.") ? "accessibility" :
            "privacy",
          confidence: row.confidence,
          domain_id: scanRow.domain_id,
          evidence_refs: row.evidence_refs,
          organization_id: scanRow.organization_id,
          population_source: "nano",
          population_status: row.population_status,
          provenance_json: [
            {
              detail: row.provenance_detail,
              kind: "document"
            }
          ],
          scan_id: input.scanId,
          signal_key: row.key,
          signal_label: row.label,
          signal_value_json: row.value,
          value_type: Array.isArray(row.value) ? "string_array" : typeof row.value === "number" ? "number" : typeof row.value === "boolean" ? "boolean" : "text"
        }))
      ),
      observedAt
    ]
  );

  return nextRows;
}

export async function appendScanWorkflowEvent(input: {
  eventType: string;
  message: string;
  metadataJson?: Record<string, unknown>;
  scanId: string;
}) {
  await query(
    `
      insert into scan_events (domain_id, event_type, message, metadata_json, organization_id, scan_id)
      values (null, $1, $2, $3, null, $4)
    `,
    [input.eventType, input.message, input.metadataJson ?? {}, input.scanId]
  );
}

export async function updateScanStatus(input: {
  scanId: string;
  status: "queued" | "running" | "completed" | "failed";
  completedAt?: string | null;
  errorMessage?: string | null;
}) {
  await query(
    `update scans set status = $1, completed_at = $2, error_message = $3, updated_at = now() where id = $4`,
    [input.status, input.completedAt ?? null, input.errorMessage ?? null, input.scanId]
  );
}

export async function hasValidationRunForScan(scanId: string) {
  const data = await queryOne<{ id: string }>(
    `select id from validation_runs where scan_id = $1 limit 1`,
    [scanId],
    { readOnly: true }
  );
  return Boolean(data?.id);
}

export async function ensureCompletedValidationRunForScan(scanId: string) {
  const existing = await queryOne<{ id: string }>(
    `select id from validation_runs where scan_id = $1 order by created_at desc limit 1`,
    [scanId],
    { readOnly: true }
  );

  if (existing?.id) {
    return existing;
  }

  const scan = await queryOne<{
    completed_at: string | null;
    created_at: string;
    domain_hostname: string | null;
    domain_id: string | null;
    domain_normalized_url: string | null;
    scan_config_json: Record<string, unknown> | null;
    snapshot_domain: string | null;
    started_at: string | null;
  }>(
    `
      select
        s.completed_at,
        s.created_at,
        s.domain_id,
        s.scan_config_json,
        s.started_at,
        d.hostname as domain_hostname,
        d.normalized_url as domain_normalized_url,
        ss.domain as snapshot_domain
      from scans s
      left join domains d on d.id = s.domain_id
      left join scan_snapshots ss on ss.scan_id = s.id
      where s.id = $1
      limit 1
    `,
    [scanId],
    { readOnly: true }
  );

  if (!scan) {
    throw new Error(`Cannot create completed validation run for missing scan ${scanId}.`);
  }

  const scanConfig = scan.scan_config_json && typeof scan.scan_config_json === "object" ? scan.scan_config_json : {};
  const configuredHostname = typeof scanConfig.hostname === "string" && scanConfig.hostname.trim().length > 0
    ? scanConfig.hostname.trim()
    : null;
  const configuredUrl = typeof scanConfig.normalizedUrl === "string" && scanConfig.normalizedUrl.trim().length > 0
    ? scanConfig.normalizedUrl.trim()
    : null;
  const hostname = configuredHostname ?? scan.domain_hostname ?? scan.snapshot_domain ?? "unknown";
  const normalizedUrl = configuredUrl ?? scan.domain_normalized_url ?? (hostname === "unknown" ? "https://unknown.invalid" : `https://${hostname}`);
  const timestamp = scan.completed_at ?? scan.started_at ?? scan.created_at ?? new Date().toISOString();

  const created = await queryOne<{ id: string }>(
    `
      insert into validation_runs (
        scan_id,
        domain_id,
        hostname,
        normalized_url,
        trigger_mode,
        status,
        started_at,
        completed_at
      )
      select $1, $2, $3, $4, 'manual', 'completed', $5, $5
      where not exists (
        select 1 from validation_runs where scan_id = $1
      )
      returning id
    `,
    [scanId, scan.domain_id, hostname, normalizedUrl, timestamp]
  );

  if (created?.id) {
    return created;
  }

  const raced = await queryOne<{ id: string }>(
    `select id from validation_runs where scan_id = $1 order by created_at desc limit 1`,
    [scanId],
    { readOnly: true }
  );

  if (!raced?.id) {
    throw new Error(`Failed to create completed validation run for scan ${scanId}.`);
  }

  return raced;
}

export function normalizeValidationTargetInput(value: string) {
  return normalizeUrl(value);
}

export function isAllowedValidationInterval(minutes: number) {
  return VALIDATION_INTERVAL_OPTIONS.includes(minutes as (typeof VALIDATION_INTERVAL_OPTIONS)[number]);
}

export async function recordValidationWorkerHeartbeat(input: {
  host: string;
  startedAt?: Date;
  heartbeatAt?: Date;
}) {
  const patch: Record<string, string | null> = {
    last_worker_heartbeat_at: (input.heartbeatAt ?? new Date()).toISOString(),
    last_worker_host: input.host
  };

  if (input.startedAt) {
    patch.last_worker_started_at = input.startedAt.toISOString();
  }

  const entries = Object.entries(patch);
  const cols = ["singleton_key", ...entries.map(([key]) => key)];
  const values = [VALIDATION_SETTINGS_KEY, ...entries.map(([, value]) => value)];
  const placeholders = cols.map((_, index) => `$${index + 1}`).join(", ");
  const updates = entries.map(([key]) => `${key} = excluded.${key}`).join(", ");
  await query(
    `
      insert into validation_settings (${cols.join(", ")})
      values (${placeholders})
      on conflict (singleton_key) do update
        set ${updates}
    `,
    values
  );
}

export async function addManualValidationTarget(hostnameOrUrl: string) {
  const normalizedUrl = normalizeValidationTargetInput(hostnameOrUrl);
  return upsertValidationTarget({
    normalizedUrl,
    source: "manual"
  });
}

export async function listRecentValidationRuns(input?: { limit?: number; page?: number }) {
  const limit = Math.max(1, Math.min(100, input?.limit ?? 50));
  const page = Math.max(1, input?.page ?? 1);
  const from = (page - 1) * limit;
  const [data, countRow] = await Promise.all([
    query<Record<string, unknown>>(
      `
        select
          id,
          hostname,
          normalized_url,
          tranco_rank,
          rank_band,
          trigger_mode,
          status,
          scan_id,
          finding_count,
          reviewed_finding_count,
          average_agreement_score,
          error_message,
          created_at,
          started_at,
          completed_at
        from validation_runs
        order by created_at desc
        offset $1
        limit $2
      `,
      [from, limit],
      { readOnly: true }
    ).then((result) => result.rows),
    queryOne<{ count: number }>(
      `select count(*)::int as count from validation_runs`,
      [],
      { readOnly: true }
    )
  ]);

  return {
    page,
    pageCount: Math.max(1, Math.ceil((countRow?.count ?? 0) / limit)),
    rows: data,
    totalCount: countRow?.count ?? 0
  };
}
