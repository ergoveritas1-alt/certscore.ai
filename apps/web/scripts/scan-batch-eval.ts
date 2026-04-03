import { createAdminClient } from "@website-signal-risk-scanner/db";
import { Queue, type ConnectionOptions } from "bullmq";
import { parseDomainBatchInput } from "@website-signal-risk-scanner/shared";
import { buildNanoPolicyInputsFromDocumentSources, shouldPreferNanoDocumentSources } from "../lib/scans/nano-document-sources";
import { buildUnifiedFindingDisplayPackets } from "../lib/scans/unified-findings";
import { getConfiguredValidationRedisUrl } from "../lib/env";
import { repairFindingFamilyPacketEvents } from "../server/scans/family-packet-event-repair";

type ScanRow = {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
};

type ScanEventRow = {
  created_at: string;
  event_type: string;
  id: string;
  message: string;
  metadata_json: unknown;
};

type DomainRow = {
  hostname: string;
  id: string;
  max_pages_override: number | null;
  normalized_url: string;
};

const DEFAULT_ORG_ID = "2f2ef2a2-d86b-4993-8bd5-de912e7de905";
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 8 * 60_000;
const POLL_INTERVAL_MS = 5_000;
const NANO_DOC_RETRIEVAL_QUEUE = "nano_doc_retrieval";
const NANO_SIGNAL_ENRICHMENT_QUEUE = "nano_signal_enrichment";
const NANO_DOC_RETRIEVAL_JOB = "nano_doc_retrieval";
const NANO_SIGNAL_ENRICHMENT_JOB = "nano_signal_enrichment";

let nanoDocQueue: Queue<{ pollCount?: number; scanId: string }> | null = null;
let nanoSignalQueue: Queue<{ pollCount?: number; scanId: string }> | null = null;

function isMissingOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("Could not find the table");
}

function createRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  return {
    enableReadyCheck: false,
    host: url.hostname,
    maxRetriesPerRequest: null,
    password: password.length > 0 ? password : undefined,
    port: Number(url.port || 6379),
    tls: url.protocol === "rediss:" ? {} : undefined,
    username: username.length > 0 ? username : undefined
  };
}

function getRedisConnection() {
  const redisUrl = getConfiguredValidationRedisUrl();
  if (!redisUrl) {
    throw new Error("Validation Redis is not configured.");
  }

  return createRedisConnection(redisUrl);
}

function getNanoDocQueue() {
  if (nanoDocQueue) {
    return nanoDocQueue;
  }

  nanoDocQueue = new Queue<{ pollCount?: number; scanId: string }>(NANO_DOC_RETRIEVAL_QUEUE, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return nanoDocQueue;
}

function getNanoSignalQueue() {
  if (nanoSignalQueue) {
    return nanoSignalQueue;
  }

  nanoSignalQueue = new Queue<{ pollCount?: number; scanId: string }>(NANO_SIGNAL_ENRICHMENT_QUEUE, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100
    }
  });

  return nanoSignalQueue;
}

async function enqueueNanoSignalEnrichment(scanId: string) {
  await Promise.all([
    getNanoDocQueue().add(
      NANO_DOC_RETRIEVAL_JOB,
      { pollCount: 0, scanId },
      {
        attempts: 2,
        jobId: `${scanId}--nano-doc-retrieval--initial`
      }
    ),
    getNanoSignalQueue().add(
      NANO_SIGNAL_ENRICHMENT_JOB,
      { pollCount: 0, scanId },
      {
        attempts: 2,
        jobId: `${scanId}--nano-doc-signals--initial`
      }
    )
  ]);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function getScanConfig(pagesRequested: number) {
  return {
    post403Policy: {
      maxHomepageRetriesAfter403: 0,
      maxPassiveVerificationFetchesAfter403: 4,
      passiveOnlyAfter403: true,
      stopOnHomepage403: true,
      verifiedSurfaceTargetsAfter403: ["privacy_policy", "terms_of_service", "cookie_policy", "contact_page"]
    },
    processor: "queued-full-scan-v1",
    profile: "standard",
    maxPages: pagesRequested,
    source: "codex-scan-batch-eval"
  };
}

async function ensureDomain(input: {
  hostname: string;
  normalizedUrl: string;
  organizationId: string;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const existing = await input.supabase
    .from("domains")
    .select("id, hostname, normalized_url, max_pages_override")
    .eq("organization_id", input.organizationId)
    .eq("normalized_url", input.normalizedUrl)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Failed to look up domain ${input.hostname}: ${existing.error.message}`);
  }

  if (existing.data) {
    return existing.data as DomainRow;
  }

  const inserted = await input.supabase
    .from("domains")
    .insert({
      organization_id: input.organizationId,
      hostname: input.hostname,
      normalized_url: input.normalizedUrl,
      status: "active"
    })
    .select("id, hostname, normalized_url, max_pages_override")
    .single();

  if (inserted.error || !inserted.data) {
    throw new Error(`Failed to create domain ${input.hostname}: ${inserted.error?.message ?? "Unknown error"}`);
  }

  return inserted.data as DomainRow;
}

async function queueScan(input: {
  domain: DomainRow;
  organizationId: string;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const pagesRequested = input.domain.max_pages_override ?? DEFAULT_MAX_PAGES;
  const inserted = await input.supabase
    .from("scans")
    .insert({
      organization_id: input.organizationId,
      domain_id: input.domain.id,
      submitted_by_user_id: null,
      scan_type: "full",
      status: "queued",
      pages_requested: pagesRequested,
      pages_scanned: 0,
      scan_config_json: getScanConfig(pagesRequested)
    })
    .select("id, status, created_at, completed_at, error_message")
    .single();

  if (inserted.error || !inserted.data) {
    throw new Error(`Failed to queue scan for ${input.domain.hostname}: ${inserted.error?.message ?? "Unknown error"}`);
  }

  await enqueueNanoSignalEnrichment(inserted.data.id).catch((error) => {
    console.error("[scan-batch-eval] nano signal enrichment handoff failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: inserted.data.id
    });
  });

  return inserted.data as ScanRow;
}

async function waitForCompletion(input: {
  hostname: string;
  scanId: string;
  supabase: ReturnType<typeof createAdminClient>;
  timeoutMs: number;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.timeoutMs) {
    const { data, error } = await input.supabase
      .from("scans")
      .select("id, status, created_at, completed_at, error_message")
      .eq("id", input.scanId)
      .single();

    if (error) {
      throw new Error(`Failed to poll scan ${input.scanId} for ${input.hostname}: ${error.message}`);
    }

    const scan = data as ScanRow;
    if (scan.status === "completed" || scan.status === "failed" || scan.status === "canceled") {
      return scan;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for scan ${input.scanId} (${input.hostname}) after ${input.timeoutMs}ms`);
}

async function summarizeScan(input: {
  hostname: string;
  scanId: string;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const [
    { data: snapshot, error: snapshotError },
    { data: events, error: eventsError },
    { data: policyEnrichment, error: policyError },
    { data: documentSources, error: documentSourcesError }
  ] =
    await Promise.all([
      input.supabase.from("scan_snapshots").select("*").eq("scan_id", input.scanId).maybeSingle(),
      input.supabase
        .from("scan_events")
        .select("id, event_type, message, metadata_json, created_at")
        .eq("scan_id", input.scanId)
        .order("created_at", { ascending: true }),
      input.supabase.from("policy_enrichment").select("*").eq("scan_id", input.scanId).order("created_at", { ascending: true }),
      input.supabase.from("scan_document_sources").select("*").eq("scan_id", input.scanId).order("created_at", { ascending: true })
    ]);

  if (snapshotError) {
    throw new Error(`Failed to load snapshot for ${input.hostname}: ${snapshotError.message}`);
  }
  if (eventsError) {
    throw new Error(`Failed to load events for ${input.hostname}: ${eventsError.message}`);
  }
  if (policyError) {
    throw new Error(`Failed to load policy enrichment for ${input.hostname}: ${policyError.message}`);
  }
  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load document sources for ${input.hostname}: ${documentSourcesError.message}`);
  }

  const normalizedDocumentSources = (documentSourcesError ? [] : documentSources ?? []) as Array<Record<string, unknown>>;
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources);
  const policySemanticRows = preferDocumentSources
    ? buildNanoPolicyInputsFromDocumentSources(normalizedDocumentSources)
    : ((policyEnrichment ?? []) as Array<Record<string, unknown>>);
  const normalizedPolicyRows = policySemanticRows.map((row, index) => {
    const next = { ...row };
    if (typeof next.id !== "string") {
      next.id = typeof row.source_document_id === "string" ? row.source_document_id : `document-semantic-${index + 1}`;
    }
    delete next.created_at;
    delete next.updated_at;
    return next;
  });

  const repairedEvents = repairFindingFamilyPacketEvents({
    events: ((events ?? []) as ScanEventRow[]).map((event) => ({
      createdAt: event.created_at,
      eventType: event.event_type,
      id: event.id,
      message: event.message,
      metadataJson: event.metadata_json
    })),
    policyEnrichment: normalizedPolicyRows
  });

  const displayPackets = buildUnifiedFindingDisplayPackets({
    policyEnrichment: normalizedPolicyRows,
    reviewFindingCandidates: [],
    scanEvents: repairedEvents,
    validationFindings: [],
    validationFindingLookup: new Map()
  });

  const surfaced = displayPackets
    .filter((packet) => packet.presentationDecision.status !== "suppress")
    .map((packet) => ({
      id: packet.unifiedFindingId,
      status: packet.presentationDecision.status,
      decision: packet.surfacingDecision.decisionState,
      url: packet.primaryPageUrl ?? packet.evidence?.pageUrls?.[0] ?? null,
      summary: packet.summary
    }));

  return {
    snapshot,
    surfaced
  };
}

async function main() {
  const orgId = getArgValue("--org") ?? DEFAULT_ORG_ID;
  const timeoutMs = Number(getArgValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  const onlySummarize = hasFlag("--summarize-only");
  const queueOnly = hasFlag("--queue-only");
  const argv = process.argv.slice(2);
  const positionalDomains: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === "--org" || token === "--timeout-ms" || token === "--domains") {
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      continue;
    }

    positionalDomains.push(token);
  }

  const explicitDomains = getArgValue("--domains");
  const parsedBatch = parseDomainBatchInput(explicitDomains ?? positionalDomains.join(" "));

  if (parsedBatch.valid.length === 0) {
    throw new Error("Provide at least one valid domain with --domains.");
  }

  const supabase = createAdminClient();
  if (onlySummarize && queueOnly) {
    throw new Error("Use either --summarize-only or --queue-only, not both.");
  }

  const results: Array<Record<string, unknown>> = [];

  for (const entry of parsedBatch.valid) {
    const domain = await ensureDomain({
      hostname: entry.domain,
      normalizedUrl: `https://${entry.domain}`,
      organizationId: orgId,
      supabase
    });

    let scanId: string;
    if (onlySummarize) {
      const latest = await supabase
        .from("scans")
        .select("id, created_at, status")
        .eq("organization_id", orgId)
        .eq("domain_id", domain.id)
        .eq("scan_type", "full")
        .in("status", ["completed", "failed", "canceled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest.error) {
        throw new Error(`Failed to load latest terminal scan for ${domain.hostname}: ${latest.error.message}`);
      }

      if (!latest.data) {
        results.push({
          domain: domain.hostname,
          pendingReason: "no_terminal_scan",
          scanId: null,
          surfaced: []
        });
        continue;
      }

      scanId = (latest.data as { id: string }).id;
    } else if (queueOnly) {
      const queued = await queueScan({
        domain,
        organizationId: orgId,
        supabase
      });

      results.push({
        domain: domain.hostname,
        scanId: queued.id,
        queuedAt: queued.created_at,
        status: queued.status
      });

      continue;
    } else {
      const queued = await queueScan({
        domain,
        organizationId: orgId,
        supabase
      });

      scanId = queued.id;
      await waitForCompletion({
        hostname: domain.hostname,
        scanId,
        supabase,
        timeoutMs
      });
    }

    const summary = await summarizeScan({
      hostname: domain.hostname,
      scanId,
      supabase
    });

    results.push({
      domain: domain.hostname,
      scanId,
      scanOutcome: (summary.snapshot as Record<string, unknown> | null)?.scan_outcome ?? null,
      stopReason: (summary.snapshot as Record<string, unknown> | null)?.stop_reason_code ?? null,
      homepageStatus: (summary.snapshot as Record<string, unknown> | null)?.homepage_fetch_http_status ?? null,
      blocked: (summary.snapshot as Record<string, unknown> | null)?.blocked_flag ?? null,
      surfaced: summary.surfaced
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
