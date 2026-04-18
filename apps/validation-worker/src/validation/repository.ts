import { randomUUID } from "node:crypto";
import { createDatabaseClient, query, queryOne } from "@website-signal-risk-scanner/db";
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
    started_at?: string | null;
    status?: string | null;
  } | null;
};

const ACTIVE_RUN_STATUSES = ["queued", "waiting_for_scan", "collecting", "ranking", "validating"] as const;
const TRANCO_SOURCE_FALLBACK_URL = "https://tranco-list.eu/latest_list";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown database error.";
}

function isMissingOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("Could not find the table");
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
    return null;
  }

  const match = VALIDATION_RANK_BANDS.find((band) => rank >= band.min && rank <= band.max);
  return match?.key ?? null;
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
  const db = createDatabaseClient();
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
  const { data: domain } = await db
    .from("domains")
    .select("id, max_pages_override")
    .eq("organization_id", organizationId)
    .eq("hostname", hostname)
    .maybeSingle();

  let domainId = (domain as { id: string } | null)?.id ?? null;

  if (!domainId) {
    const { data: insertedDomain, error: domainError } = await db
      .from("domains")
      .insert({
        organization_id: organizationId,
        hostname,
        normalized_url: normalizedUrl,
        status: "active"
      })
      .select("id")
      .single();

    if (domainError || !insertedDomain) {
      throw new Error(`Failed to create validation domain ${hostname}: ${domainError?.message ?? "Unknown error"}`);
    }

    domainId = insertedDomain.id as string;
  } else {
    await db
      .from("domains")
      .update({
        normalized_url: normalizedUrl,
        status: "active"
      })
      .eq("id", domainId);
  }

  const { data: scan, error: scanError } = await db
    .from("scans")
    .insert({
      organization_id: organizationId,
      domain_id: domainId,
      submitted_by_user_id: null,
      scan_type: "full",
      status: "queued",
      pages_requested: teamPlan.maxPagesPerScan,
      pages_scanned: 0,
      scan_config_json: buildSharedFullScanConfig({
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
    })
    .select("id")
    .single();

  if (scanError || !scan) {
    throw new Error(`Failed to create validation scan for ${hostname}: ${scanError?.message ?? "Unknown error"}`);
  }

  await Promise.all([
    db.from("domains").update({ latest_scan_id: scan.id }).eq("id", domainId),
    db
      .from("validation_runs")
      .update({
        scan_id: scan.id,
        status: "collecting",
        started_at: new Date().toISOString(),
        error_message: null
      })
      .eq("id", runId),
    run.validation_target_id
      ? db
          .from("validation_targets")
          .update({
            last_run_at: new Date().toISOString(),
            last_status: "collecting"
          })
          .eq("id", run.validation_target_id)
      : Promise.resolve()
  ]);

  return scan.id as string;
}

export async function loadCompletedScanArtifacts(scanId: string) {
  const db = createDatabaseClient();
  const [
    { data: scan, error: scanError },
    { data: snapshot, error: snapshotError },
    { data: runtimeArtifacts, error: runtimeArtifactsError },
    { data: rawSignals, error: signalsError },
    { data: trackerVendors, error: trackerError },
    { data: pages, error: pagesError },
    { data: policyEnrichments, error: policyEnrichmentError },
    { data: documentSources, error: documentSourcesError },
    { data: macroEnrichment, error: macroEnrichmentError },
    { data: policyReviewQueue, error: policyReviewQueueError },
    { data: preconsentViolations, error: preconsentError },
    { data: signalHits, error: signalHitsError },
    { data: pageEvidence, error: pageEvidenceError }
  ] = await Promise.all([
    db
      .from("scans")
      .select("id, status, created_at, completed_at, error_message")
      .eq("id", scanId)
      .maybeSingle(),
    db.from("scan_snapshots").select("*").eq("scan_id", scanId).maybeSingle(),
    db.from("scan_runtime_artifacts").select("*").eq("scan_id", scanId).maybeSingle(),
    db
      .from("scan_signals")
      .select("category, signal_key, signal_label, signal_value_json, value_type, population_source, population_status, confidence, evidence_refs, provenance_json, observed_at")
      .eq("scan_id", scanId)
      .order("category", { ascending: true })
      .order("signal_key", { ascending: true }),
    db
      .from("scan_tracker_vendors")
      .select("vendor_name, vendor_category, confidence, detection_source, first_party_or_third_party, before_consent, script_host, matched_signature_id")
      .eq("scan_id", scanId)
      .order("vendor_name", { ascending: true }),
    db
      .from("scan_pages")
      .select("page_type, page_url, fetch_status")
      .eq("scan_id", scanId)
      .order("page_type", { ascending: true }),
    db
      .from("policy_enrichment")
      .select("*")
      .eq("scan_id", scanId),
    db.from("scan_document_sources").select("*").eq("scan_id", scanId).order("created_at", { ascending: true }),
    db.from("scan_macro_enrichments").select("*").eq("scan_id", scanId).maybeSingle(),
    db
      .from("policy_review_queue")
      .select("id, policy_enrichment_id, reason, review_status, review_verdict, reviewer_notes, created_at, reviewed_at")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true }),
    db
      .from("scan_preconsent_violations")
      .select("vendor_name, evidence_urls, collection_endpoint_type")
      .eq("scan_id", scanId),
    db
      .from("scan_signal_hits")
      .select("id, signal_key, page_url, page_type, page_role, evidence_refs, payload")
      .eq("scan_id", scanId)
      .in("signal_key", [
        "commercial.explicit_fee_disclosure_text_present",
        "financial.apr_or_interest_rate_disclosure_text_present",
        "financial.past_performance_disclaimer_text_present"
      ]),
    db
      .from("scan_page_evidence")
      .select("evidence_id, page_url, page_type, page_role, matched_text, metadata")
      .eq("scan_id", scanId)
  ]);

  if (scanError) {
    throw new Error(`Failed to load validation scan ${scanId}: ${scanError.message}`);
  }
  if (snapshotError) {
    throw new Error(`Failed to load validation scan snapshot ${scanId}: ${snapshotError.message}`);
  }
  if (runtimeArtifactsError) {
    throw new Error(`Failed to load validation runtime artifacts ${scanId}: ${runtimeArtifactsError.message}`);
  }
  if (signalsError) {
    throw new Error(`Failed to load validation signal populations ${scanId}: ${signalsError.message}`);
  }
  if (trackerError) {
    throw new Error(`Failed to load validation tracker vendors ${scanId}: ${trackerError.message}`);
  }
  if (pagesError) {
    throw new Error(`Failed to load validation scan pages ${scanId}: ${pagesError.message}`);
  }
  if (policyEnrichmentError) {
    throw new Error(`Failed to load policy enrichment ${scanId}: ${policyEnrichmentError.message}`);
  }
  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load document sources ${scanId}: ${documentSourcesError.message}`);
  }
  if (macroEnrichmentError && !isMissingOptionalTableError(macroEnrichmentError)) {
    throw new Error(`Failed to load scan macro enrichment ${scanId}: ${macroEnrichmentError.message}`);
  }
  if (policyReviewQueueError) {
    throw new Error(`Failed to load policy review queue ${scanId}: ${policyReviewQueueError.message}`);
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

  const runtimeArtifactsRecord = (runtimeArtifacts as Record<string, unknown> | null) ?? null;
  const rawSignalRows = (rawSignals ?? []) as SignalPopulationRow[];
  const scannerSignalRows = rawSignalRows.filter((signal) => !signal.population_source || signal.population_source === "scanner");
  const storedNanoSignalRows = rawSignalRows.filter((signal) => signal.population_source === "nano");
  const storedValidationSignalRows = rawSignalRows.filter((signal) => signal.population_source === "validation");
  const fallbackFinancialEvidence = extractFallbackFinancialEvidenceFromRuntimeArtifacts(runtimeArtifactsRecord);
  const loadedPageEvidence = (pageEvidenceError ? [] : pageEvidence ?? []) as Array<Record<string, unknown>>;
  const loadedSignalHits = (signalHitsError ? [] : signalHits ?? []) as Array<Record<string, unknown>>;
  const normalizedDocumentSources = (documentSourcesError ? [] : documentSources ?? []) as Array<Record<string, unknown>>;
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources);
  const fallbackPolicyRows = ((policyEnrichments ?? []) as Array<Record<string, unknown>>);
  const policySemanticInputs = preferDocumentSources
    ? mergeNanoPolicyInputsWithFallback({
        documentSources: normalizedDocumentSources,
        fallbackRows: fallbackPolicyRows
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
    documentSources: normalizedDocumentSources,
    mergedSignals,
    pageEvidence: loadedPageEvidence.length > 0 ? loadedPageEvidence : fallbackFinancialEvidence.pageEvidence,
    pages: (pages ?? []) as Array<Record<string, unknown>>,
    macroEnrichment: (macroEnrichmentError ? null : (macroEnrichment as Record<string, unknown> | null)) ?? null,
    policyEnrichments: fallbackPolicyRows,
    policySemanticRows: policySemanticInputs,
    policySemanticInputs,
    policyReviewQueue: (policyReviewQueue ?? []) as Array<Record<string, unknown>>,
    preferDocumentSources,
    preconsentViolations: (preconsentError ? [] : preconsentViolations ?? []) as Array<Record<string, unknown>>,
    rawPolicyEnrichmentRows: fallbackPolicyRows,
    runtimeArtifacts: runtimeArtifactsRecord,
    scan: (scan as Record<string, unknown> | null) ?? null,
    signalHits: loadedSignalHits.length > 0 ? loadedSignalHits : fallbackFinancialEvidence.signalHits,
    snapshot: (snapshot as Record<string, unknown> | null) ?? null,
    trackerVendors: (trackerVendors ?? []) as Array<Record<string, unknown>>
  };
}

export async function loadNanoSignalEnrichmentInputs(scanId: string) {
  const db = createDatabaseClient();
  const [
    { data: scan, error: scanError },
    { data: snapshot, error: snapshotError },
    { data: runtimeArtifacts, error: runtimeArtifactsError },
    { data: policyEnrichments, error: policyEnrichmentError },
    { data: policyReviewQueue, error: policyReviewQueueError },
    { data: documentSources, error: documentSourcesError }
  ] = await Promise.all([
    db.from("scans").select("id, status, created_at, started_at, completed_at, error_message").eq("id", scanId).maybeSingle(),
    db.from("scan_snapshots").select("*").eq("scan_id", scanId).maybeSingle(),
    db.from("scan_runtime_artifacts").select("*").eq("scan_id", scanId).maybeSingle(),
    db.from("policy_enrichment").select("*").eq("scan_id", scanId).order("created_at", { ascending: true }),
    db.from("policy_review_queue").select("*").eq("scan_id", scanId).order("created_at", { ascending: true }),
    db
      .from("scan_document_sources")
      .select("*")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true })
  ]);

  if (scanError) {
    throw new Error(`Failed to load scan for nano signal enrichment ${scanId}: ${scanError.message}`);
  }
  if (snapshotError) {
    throw new Error(`Failed to load snapshot for nano signal enrichment ${scanId}: ${snapshotError.message}`);
  }
  if (runtimeArtifactsError) {
    throw new Error(`Failed to load runtime artifacts for nano signal enrichment ${scanId}: ${runtimeArtifactsError.message}`);
  }
  if (policyEnrichmentError) {
    throw new Error(`Failed to load policy enrichment for nano signal enrichment ${scanId}: ${policyEnrichmentError.message}`);
  }
  if (policyReviewQueueError) {
    throw new Error(`Failed to load policy review queue for nano signal enrichment ${scanId}: ${policyReviewQueueError.message}`);
  }
  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load document sources for nano signal enrichment ${scanId}: ${documentSourcesError.message}`);
  }

  const normalizedDocumentSources = (documentSourcesError ? [] : documentSources ?? []) as Array<Record<string, unknown>>;
  const fallbackPolicyRows = ((policyEnrichments ?? []) as Array<Record<string, unknown>>);
  const documentBackedPolicyInputs = mergeNanoPolicyInputsWithFallback({
    documentSources: normalizedDocumentSources,
    fallbackRows: fallbackPolicyRows
  });
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources);
  return {
    documentSources: normalizedDocumentSources,
    policySemanticRows: preferDocumentSources ? documentBackedPolicyInputs : fallbackPolicyRows,
    policySignalInputs: preferDocumentSources ? documentBackedPolicyInputs : fallbackPolicyRows,
    policyEnrichments: fallbackPolicyRows,
    policyReviewQueue: (policyReviewQueue ?? []) as Array<Record<string, unknown>>,
    preferDocumentSources,
    rawPolicyEnrichmentRows: fallbackPolicyRows,
    runtimeArtifacts: (runtimeArtifacts as Record<string, unknown> | null) ?? null,
    scan: (scan as {
      completed_at?: string | null;
      created_at?: string | null;
      error_message?: string | null;
      id?: string;
      started_at?: string | null;
      status?: string | null;
    } | null) ?? null,
    snapshot: (snapshot as Record<string, unknown> | null) ?? null
  };
}

export async function loadNanoDocRetrievalInputs(scanId: string): Promise<NanoDocRetrievalInput> {
  const db = createDatabaseClient();
  const { data: scan, error: scanError } = await db
    .from("scans")
    .select("id, status, created_at, started_at, completed_at, error_message, domain_id")
    .eq("id", scanId)
    .maybeSingle();

  if (scanError) {
    throw new Error(`Failed to load scan for nano doc retrieval ${scanId}: ${scanError.message}`);
  }

  const domainId = typeof scan?.domain_id === "string" ? scan.domain_id : null;
  const recentDomainScansPromise = domainId
    ? db
        .from("scans")
        .select("id")
        .eq("domain_id", domainId)
        .neq("id", scanId)
        .order("created_at", { ascending: false })
        .limit(5)
    : Promise.resolve({ data: [], error: null });
  const [
    { data: domain, error: domainError },
    { data: pages, error: pagesError },
    { data: events, error: eventsError },
    { data: documentSources, error: documentSourcesError },
    { data: runtimeArtifacts, error: runtimeArtifactsError },
    { data: recentDomainScans, error: recentDomainScansError }
  ] = await Promise.all([
    domainId ? db.from("domains").select("hostname").eq("id", domainId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db.from("scan_pages").select("page_type, page_url, fetch_status").eq("scan_id", scanId).order("page_type", { ascending: true }),
    db
      .from("scan_events")
      .select("event_type, metadata_json, created_at")
      .eq("scan_id", scanId)
      .eq("event_type", "runtime.build_phase_diagnostic")
      .order("created_at", { ascending: true }),
    db.from("scan_document_sources").select("*").eq("scan_id", scanId).order("created_at", { ascending: true }),
    db.from("scan_runtime_artifacts").select("*").eq("scan_id", scanId).maybeSingle(),
    recentDomainScansPromise
  ]);

  if (domainError && !isMissingOptionalTableError(domainError)) {
    throw new Error(`Failed to load domain for nano doc retrieval ${scanId}: ${domainError.message}`);
  }
  if (pagesError) {
    throw new Error(`Failed to load scan pages for nano doc retrieval ${scanId}: ${pagesError.message}`);
  }
  if (eventsError) {
    throw new Error(`Failed to load discovery events for nano doc retrieval ${scanId}: ${eventsError.message}`);
  }
  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load existing document sources for nano doc retrieval ${scanId}: ${documentSourcesError.message}`);
  }
  if (runtimeArtifactsError) {
    throw new Error(`Failed to load runtime artifacts for nano doc retrieval ${scanId}: ${runtimeArtifactsError.message}`);
  }
  if (recentDomainScansError) {
    throw new Error(`Failed to load recent domain scans for nano doc retrieval ${scanId}: ${recentDomainScansError.message}`);
  }

  const recentDomainScanIds = ((recentDomainScans ?? []) as Array<Record<string, unknown>>)
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((value): value is string => typeof value === "string");
  const recentDomainDocumentCandidates =
    recentDomainScanIds.length > 0
      ? (
          await db
            .from("scan_document_sources")
            .select("canonical_url, source_url, document_type, title, semantic_confidence, created_at")
            .in("scan_id", recentDomainScanIds)
            .eq("source_status", "ready")
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];

  const discoveryCandidates = ((events ?? []) as Array<Record<string, unknown>>).flatMap((event) => {
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
    existingDocumentSources: (documentSources ?? []) as Array<Record<string, unknown>>,
    pages: (pages ?? []) as Array<Record<string, unknown>>,
    recentDomainDocumentCandidates: (recentDomainDocumentCandidates ?? []) as Array<Record<string, unknown>>,
    runtimeArtifacts: (runtimeArtifacts as Record<string, unknown> | null) ?? null,
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
  const db = createDatabaseClient();
  const run = await getValidationRun(runId);
  const { error: deleteError } = await db.from("validation_run_findings").delete().eq("validation_run_id", runId);

  if (deleteError) {
    throw new Error(`Failed to clear validation findings for run ${runId}: ${deleteError.message}`);
  }

  if (findings.length === 0) {
    await updateValidationRun(runId, {
      finding_count: 0,
      reviewed_finding_count: 0
    });
    if (run?.scan_id) {
      await persistValidationRunReportFindingCount({
        runId,
        scanId: run.scan_id,
        db
      });
    }
    return [];
  }

  const baseRows = findings.map((finding) => ({
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
  }));

  let insertResult = await db
    .from("validation_run_findings")
    .insert(baseRows.map((row) => ({ ...row, rank: row.finding_rank })))
    .select("id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, finding_rank, evidence_json");

  if (insertResult.error && isMissingColumnError(insertResult.error, "rank")) {
    insertResult = await db
      .from("validation_run_findings")
      .insert(baseRows)
      .select("id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, finding_rank, evidence_json");
  }

  if (insertResult.error) {
    throw new Error(`Failed to insert validation findings for run ${runId}: ${insertResult.error.message}`);
  }

  await updateValidationRun(runId, {
    finding_count: findings.length
  });

  if (run?.scan_id) {
    await persistValidationRunReportFindingCount({
      runId,
      scanId: run.scan_id,
      db
    });
  }

  return (insertResult.data ?? []) as Array<Record<string, unknown>>;
}

export async function loadValidationRunFindings(runId: string) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("validation_run_findings")
    .select("id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, finding_rank, evidence_json")
    .eq("validation_run_id", runId)
    .order("finding_rank", { ascending: true });

  if (error) {
    throw new Error(`Failed to load validation findings for run ${runId}: ${error.message}`);
  }

  return (data ?? []) as Array<Record<string, unknown>>;
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
  const db = createDatabaseClient();
  const { error } = await db
    .from("validation_verdicts")
    .upsert(
      {
        validation_run_finding_id: input.validationRunFindingId,
        verdict: input.verdict,
        confidence: input.confidence,
        rationale: input.rationale,
        agreement_score: input.agreementScore,
        model: input.model,
        prompt_version: input.promptVersion,
        evidence_json: input.evidence
      },
      {
        onConflict: "validation_run_finding_id"
      }
    );

  if (error) {
    throw new Error(`Failed to persist validation verdict ${input.validationRunFindingId}: ${error.message}`);
  }
}

export async function finalizeValidationRun(runId: string) {
  const db = createDatabaseClient();
  const run = await getValidationRun(runId);

  if (!run) {
    throw new Error(`Validation run ${runId} was not found.`);
  }

  const { data: verdicts, error: verdictError } = await db
    .from("validation_verdicts")
    .select("agreement_score")
    .in(
      "validation_run_finding_id",
      (
        (
          await db
            .from("validation_run_findings")
            .select("id")
            .eq("validation_run_id", runId)
        ).data ?? []
      ).map((row) => row.id)
    );

  if (verdictError) {
    throw new Error(`Failed to load validation verdicts for run ${runId}: ${verdictError.message}`);
  }

  const scores = ((verdicts ?? []) as Array<{ agreement_score: number }>).map((row) => row.agreement_score);
  const averageAgreementScore =
    scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
  const completedAt = new Date();

  await updateValidationRun(runId, {
    average_agreement_score: averageAgreementScore,
    completed_at: completedAt.toISOString(),
    error_message: null,
    reviewed_finding_count: scores.length,
    status: "completed"
  });

  if (run.scan_id) {
    await persistValidationRunReportFindingCount({
      runId,
      scanId: run.scan_id,
      db
    });
  }

  if (!run.validation_target_id) {
    return;
  }

  const cooldownDays = run.tranco_rank && run.tranco_rank <= 20_000 ? 14 : 30;
  const { data: snapshot } = await db
    .from("scan_snapshots")
    .select("blocked_flag, captcha_flag, homepage_fetch_http_status, robots_fetch_http_status, challenge_suspected, rate_limit_suspected, scan_outcome, cooldown_hours")
    .eq("scan_id", run.scan_id)
    .maybeSingle();

  const blocked =
    snapshot?.blocked_flag === true ||
    snapshot?.captcha_flag === true ||
    snapshot?.homepage_fetch_http_status === 403 ||
    snapshot?.homepage_fetch_http_status === 429 ||
    snapshot?.robots_fetch_http_status === 403 ||
    snapshot?.robots_fetch_http_status === 429 ||
    snapshot?.scan_outcome === "robots_restricted" ||
    snapshot?.scan_outcome === "unknown_access_limitation";
  const retryPolicy = deriveRetryPolicy({
    homepageHttpStatus: snapshot?.homepage_fetch_http_status ?? null,
    transportFailure: snapshot?.scan_outcome === "transport_failure" || snapshot?.scan_outcome === "timeout_navigation",
    challengeSuspected: snapshot?.challenge_suspected === true,
    rateLimitSuspected: snapshot?.rate_limit_suspected === true
  });
  const blockedCooldownHours =
    typeof snapshot?.cooldown_hours === "number" && Number.isFinite(snapshot.cooldown_hours)
      ? snapshot.cooldown_hours
      : retryPolicy.cooldownHours;

  await db
    .from("validation_targets")
    .update({
      backoff_until: blocked ? addDays(completedAt, 90).toISOString() : null,
      cooldown_until: blocked
        ? new Date(completedAt.getTime() + blockedCooldownHours * 60 * 60 * 1000).toISOString()
        : addDays(completedAt, cooldownDays).toISOString(),
      last_completed_at: completedAt.toISOString(),
      last_error: null,
      last_status: "completed"
    })
    .eq("id", run.validation_target_id);
}

async function persistValidationRunReportFindingCount(input: {
  runId: string;
  scanId: string;
  db: ReturnType<typeof createDatabaseClient>;
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
      scanId: input.scanId,
      db: input.db
    });

    if (!scanRecord) {
      return;
    }

    const reportFindingCount = buildScanReportUnifiedFindings(scanRecord).length;
    const { error: snapshotUpdateError } = await input.db
      .from("scan_snapshots")
      .update({
        report_finding_count: reportFindingCount
      })
      .eq("scan_id", input.scanId);

    if (snapshotUpdateError) {
      console.error("[validation-worker] failed to persist report finding count", {
        error: snapshotUpdateError.message,
        runId: input.runId,
        scanId: input.scanId
      });
    }
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
  db: ReturnType<typeof createDatabaseClient>;
}) {
  const [
    { data: snapshot },
    { data: runtimeArtifacts },
    { data: preconsentViolations },
    { data: trackerVendors },
    { data: accessibilityRuleCounts },
    { data: accessibilityRuleExamples },
    { data: policyEnrichment },
    { data: documentSources },
    { data: policyReviewQueue },
    { data: signals },
    { data: events },
    { data: validationFindingRows }
  ] = await Promise.all([
    input.db.from("scan_snapshots").select("*").eq("scan_id", input.scanId).maybeSingle(),
    input.db.from("scan_runtime_artifacts").select("*").eq("scan_id", input.scanId).maybeSingle(),
    input.db.from("scan_preconsent_violations").select("*").eq("scan_id", input.scanId),
    input.db.from("scan_tracker_vendors").select("*").eq("scan_id", input.scanId),
    input.db.from("scan_accessibility_rule_counts").select("*").eq("scan_id", input.scanId),
    input.db.from("scan_accessibility_rule_examples").select("*").eq("scan_id", input.scanId),
    input.db.from("policy_enrichment").select("*").eq("scan_id", input.scanId).order("created_at", { ascending: true }),
    input.db.from("scan_document_sources").select("*").eq("scan_id", input.scanId).order("created_at", { ascending: true }),
    input.db.from("policy_review_queue").select("*").eq("scan_id", input.scanId).order("created_at", { ascending: true }),
    input.db
      .from("scan_signals")
      .select("category, signal_key, signal_label, signal_value_json, value_type, population_source, population_status, confidence, evidence_refs, provenance_json, observed_at")
      .eq("scan_id", input.scanId),
    input.db.from("scan_events").select("id, event_type, message, metadata_json, created_at").eq("scan_id", input.scanId).order("created_at", { ascending: true }),
    input.db
      .from("validation_run_findings")
      .select(
        "id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json"
      )
      .eq("validation_run_id", input.runId)
  ]);

  const validationFindingBaseRows = (validationFindingRows ?? []) as ValidationRunFindingWithVerdictRow[];
  const validationFindingIds = validationFindingBaseRows.map((row) => row.id);
  const verdictByFindingId = new Map<string, ValidationVerdictRow>();

  if (validationFindingIds.length > 0) {
    const { data: verdictRows, error: verdictsError } = await input.db
      .from("validation_verdicts")
      .select(
        "validation_run_finding_id, verdict, confidence, rationale, agreement_score, model, prompt_version, system_confidence_score, system_confidence_band, system_confidence_explanation"
      )
      .in("validation_run_finding_id", validationFindingIds)
      .order("created_at", { ascending: false });

    if (verdictsError) {
      throw new Error(`Failed to load validation verdicts for ${input.scanId}: ${verdictsError.message}`);
    }

    for (const row of (verdictRows ?? []) as ValidationVerdictRow[]) {
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
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources);
  const fallbackPolicyRows = ((policyEnrichment ?? []) as Array<Record<string, unknown>>);
  const policySemanticRows = preferDocumentSources
    ? mergeNanoPolicyInputsWithFallback({
        documentSources: normalizedDocumentSources,
        fallbackRows: fallbackPolicyRows
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
  const db = createDatabaseClient();
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

  const target = await db
    .from("validation_targets")
    .select("failure_count")
    .eq("id", run.validation_target_id)
    .maybeSingle();
  const failureCount = Number(target.data?.failure_count ?? 0) + 1;
  const backoffDays = Math.min(30, 2 ** Math.min(failureCount - 1, 4));

  await db
    .from("validation_targets")
    .update({
      backoff_until: addDays(failedAt, backoffDays).toISOString(),
      failure_count: failureCount,
      last_error: message,
      last_status: "failed"
    })
    .eq("id", run.validation_target_id);
}

export async function markValidationSchedule(input: {
  nextDueAt: Date;
  now: Date;
}) {
  const db = createDatabaseClient();
  const { error } = await db
    .from("validation_settings")
    .update({
      last_scheduled_at: input.now.toISOString(),
      next_due_at: input.nextDueAt.toISOString()
    })
    .eq("singleton_key", VALIDATION_SETTINGS_KEY);

  if (error) {
    throw new Error(`Failed to update validation scheduler state: ${error.message}`);
  }
}

export async function replaceScanDocumentSources(input: {
  rows: Array<Record<string, unknown>>;
  scanId: string;
}) {
  const db = createDatabaseClient();
  const { error: deleteError } = await db.from("scan_document_sources").delete().eq("scan_id", input.scanId).eq("source", "nano_doc_retrieval");

  if (deleteError && !isMissingOptionalTableError(deleteError)) {
    throw new Error(`Failed to clear document sources for scan ${input.scanId}: ${deleteError.message}`);
  }

  const nanoOwnedRows = input.rows.filter((row) => {
    const source = typeof row.source === "string" ? row.source : typeof row.sourceSource === "string" ? row.sourceSource : null;
    return source === "nano_doc_retrieval";
  });

  if (nanoOwnedRows.length === 0) {
    return [];
  }

  const { error: insertError } = await db.from("scan_document_sources").insert(
    prepareScanDocumentSourceRows(nanoOwnedRows, input.scanId)
  );

  if (insertError) {
    throw new Error(`Failed to persist document sources for scan ${input.scanId}: ${insertError.message}`);
  }

  return nanoOwnedRows;
}

export async function appendScanDocumentSources(input: {
  rows: Array<Record<string, unknown>>;
  scanId: string;
}) {
  if (input.rows.length === 0) {
    return [];
  }

  const db = createDatabaseClient();
  const { error } = await db.from("scan_document_sources").insert(
    prepareScanDocumentSourceRows(input.rows, input.scanId)
  );

  if (error) {
    throw new Error(`Failed to append document sources for scan ${input.scanId}: ${error.message}`);
  }

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
  const db = createDatabaseClient();

  for (const row of input.rows) {
    const { error } = await db
      .from("scan_document_sources")
      .update({
        extracted_fields_json: sanitizeJsonPersistenceValue(row.extractedFields),
        extraction_status: row.extractionStatus,
        metadata_json: sanitizeJsonPersistenceValue(row.metadata ?? {}),
        semantic_confidence: row.semanticConfidence,
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(`Failed to update document source extraction ${row.id}: ${error.message}`);
    }
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

  const db = createDatabaseClient();
  const [exactUrlResult, recentTypeResult] = await Promise.all([
    canonicalUrls.length === 0
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null })
      : db
          .from("scan_document_sources")
          .select("*")
          .in("canonical_url", canonicalUrls)
          .eq("extraction_status", "ready")
          .neq("scan_id", input.scanId)
          .order("updated_at", { ascending: false }),
    documentTypes.length === 0
      ? Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null })
      : db
          .from("scan_document_sources")
          .select("*")
          .in("document_type", documentTypes)
          .eq("extraction_status", "ready")
          .neq("scan_id", input.scanId)
          .order("updated_at", { ascending: false })
          .limit(250)
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
  const db = createDatabaseClient();
  const nextRows = buildNanoPolicySignalRows({
    policyEnrichments: input.policySemanticRows,
    policyReviewQueue: input.policyReviewQueue,
    runtimeArtifacts: input.runtimeArtifacts,
    snapshot: input.snapshot
  });
  const { data: scanRow, error: scanError } = await db
    .from("scans")
    .select("organization_id, domain_id")
    .eq("id", input.scanId)
    .maybeSingle();

  if (scanError || !scanRow?.domain_id) {
    throw new Error(`Failed to load scan ownership for nano policy signals ${input.scanId}: ${scanError?.message ?? "missing scan"}`);
  }

  const nextKeys = new Set(nextRows.map((row) => row.key));
  const managedKeysToDelete = [...MANAGED_NANO_POLICY_SIGNAL_KEYS].filter((key) => !nextKeys.has(key));
  if (managedKeysToDelete.length > 0) {
    const { error: deleteError } = await db
      .from("scan_signals")
      .delete()
      .eq("scan_id", input.scanId)
      .eq("population_source", "nano")
      .in("signal_key", managedKeysToDelete);

    if (deleteError) {
      throw new Error(`Failed to clear stale nano signal rows for scan ${input.scanId}: ${deleteError.message}`);
    }
  }

  if (nextRows.length === 0) {
    return nextRows;
  }

  const { error } = await db.from("scan_signals").upsert(
    nextRows.map((row) => ({
      category:
        row.key.startsWith("commerce.") ? "commerce" :
        row.key.startsWith("disclosure.") ? "disclosure" :
        row.key.startsWith("accessibility.") ? "accessibility" :
        "privacy",
      confidence: row.confidence,
      domain_id: scanRow.domain_id,
      evidence_refs: row.evidence_refs,
      observed_at: new Date().toISOString(),
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
    })),
    {
      onConflict: "scan_id,signal_key,population_source"
    }
  );

  if (error) {
    throw new Error(`Failed to persist nano policy signals for scan ${input.scanId}: ${error.message}`);
  }

  return nextRows;
}

export async function appendScanWorkflowEvent(input: {
  eventType: string;
  message: string;
  metadataJson?: Record<string, unknown>;
  scanId: string;
}) {
  const db = createDatabaseClient();
  const { error } = await db.from("scan_events").insert({
    domain_id: null,
    event_type: input.eventType,
    message: input.message,
    metadata_json: input.metadataJson ?? {},
    organization_id: null,
    scan_id: input.scanId
  });

  if (error) {
    throw new Error(`Failed to append scan workflow event ${input.eventType} for scan ${input.scanId}: ${error.message}`);
  }
}

export async function hasValidationRunForScan(scanId: string) {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("validation_runs")
    .select("id")
    .eq("scan_id", scanId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check validation run for scan ${scanId}: ${error.message}`);
  }

  return Boolean(data?.id);
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
  const db = createDatabaseClient();
  const patch: Record<string, string | null> = {
    last_worker_heartbeat_at: (input.heartbeatAt ?? new Date()).toISOString(),
    last_worker_host: input.host
  };

  if (input.startedAt) {
    patch.last_worker_started_at = input.startedAt.toISOString();
  }

  const { error } = await db
    .from("validation_settings")
    .upsert(
      {
        singleton_key: VALIDATION_SETTINGS_KEY,
        ...patch
      },
      { onConflict: "singleton_key" }
    );

  if (error) {
    throw new Error(`Failed to record validation worker heartbeat: ${error.message}`);
  }
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
  const to = from + limit - 1;
  const db = createDatabaseClient();
  const { data, error, count } = await db
    .from("validation_runs")
    .select(
      "id, hostname, normalized_url, tranco_rank, rank_band, trigger_mode, status, scan_id, finding_count, reviewed_finding_count, average_agreement_score, error_message, created_at, started_at, completed_at",
      {
        count: "exact"
      }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Failed to list validation runs: ${error.message}`);
  }

  return {
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / limit)),
    rows: (data ?? []) as Array<Record<string, unknown>>,
    totalCount: count ?? 0
  };
}
