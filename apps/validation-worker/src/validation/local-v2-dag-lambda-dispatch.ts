import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  GPC_OBSERVATION_DISPATCH_CONTRACT_VERSION,
  buildPostActionObservationDispatchConfigs,
} from "@certscore/contracts";
import { query, withWriteTransaction } from "@website-signal-risk-scanner/db";
import { isFreshPriorScanAccelerationSource } from "@website-signal-risk-scanner/shared";
import { randomUUID } from "node:crypto";

const DISPATCH_CONTRACT_VERSION = "certscore.v2.lambda-dag-dispatch.v1";
const PROCESSOR = "local-certscore-v2-dag-parallel-v1";
const SCANNER_RUNTIME = "certscore-v2-dag-parallel-path";
const CLAIM_LEASE_MS = 30_000;
const DISPATCH_SEND_TIMEOUT_MS = 5_000;
const MAX_POLICY_SURFACE_SEEDS = 12;
const MAX_RETRY_DELAY_MS = 60_000;
const POLICY_SURFACE_HINT_TYPES = new Set([
  "privacy_policy",
  "cookie_policy",
  "privacy_choice",
  "consent_preferences",
]);

type AwsRegion = "eu-central-1" | "eu-west-1" | "us-west-1";

type ClaimedDispatch = {
  attempt_count: number;
  domain_id: string | null;
  organization_id: string | null;
  scan_config_json: Record<string, unknown>;
  scan_id: string;
};

export type LocalV2DagLambdaDispatchPublisherOptions = {
  enabled: boolean;
  pollMs: number;
  queueUrls: Partial<Record<AwsRegion, string | undefined>>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Durable Lambda dispatch is missing ${field}.`);
  }
  return value.trim();
}

function awsRegion(value: unknown): AwsRegion {
  if (value === "eu-central-1" || value === "eu-west-1" || value === "us-west-1") {
    return value;
  }
  throw new Error("Durable Lambda dispatch has an unsupported AWS region.");
}

function policySurfaceSeeds(scanConfig: Record<string, unknown>) {
  const execution = asRecord(scanConfig.execution);
  const hints = Array.isArray(execution.crawlSeedHints) ? execution.crawlSeedHints : [];
  const selected = new Map<string, Record<string, unknown>>();
  for (const value of hints) {
    const hint = asRecord(value);
    const hintType = typeof hint.hintType === "string" ? hint.hintType.trim() : "";
    const source = hint.source;
    const sourceCompletedAt = typeof hint.sourceCompletedAt === "string" ? hint.sourceCompletedAt.trim() : "";
    const sourceScanId = typeof hint.sourceScanId === "string" ? hint.sourceScanId.trim() : "";
    const url = typeof hint.url === "string" ? hint.url.trim() : "";
    if (
      !POLICY_SURFACE_HINT_TYPES.has(hintType) ||
      (source !== "prior_scan_hint" && source !== "canonical_legal_surface_hint") ||
      !sourceCompletedAt ||
      !sourceScanId ||
      (source === "prior_scan_hint" && !isFreshPriorScanAccelerationSource(sourceCompletedAt, Date.now())) ||
      !url
    ) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      parsed.hash = "";
      const normalizedUrl = parsed.toString();
      if (!selected.has(normalizedUrl)) {
        selected.set(normalizedUrl, {
          ...(typeof hint.confidence === "number" && Number.isFinite(hint.confidence)
            ? { confidence: Math.max(0, Math.min(1, hint.confidence)) }
            : {}),
          hintType,
          source,
          sourceCompletedAt,
          sourceScanId: sourceScanId.slice(0, 160),
          url: normalizedUrl,
        });
      }
    } catch {
      // Ignore malformed optional hints; they are acceleration metadata, not evidence.
    }
    if (selected.size >= MAX_POLICY_SURFACE_SEEDS) break;
  }
  return [...selected.values()];
}

export function buildDurableLocalV2DagLambdaDispatchPayload(input: {
  scanConfig: Record<string, unknown>;
  scanId: string;
}) {
  const execution = asRecord(input.scanConfig.execution);
  const parallel = asRecord(execution.v2DagParallel);
  const intent = asRecord(execution.v2DagLambda);
  const region = awsRegion(intent.awsRegion);
  const seeds = policySurfaceSeeds(input.scanConfig);
  const targetUrl = requiredString(input.scanConfig.normalizedUrl, "normalizedUrl");
  const postActionObservation = buildPostActionObservationDispatchConfigs({
    intent,
    scanId: input.scanId,
    targetUrl,
  });
  const gpcObservation = intent.gpcObservationRequested === true
    ? {
        contractVersion: GPC_OBSERVATION_DISPATCH_CONTRACT_VERSION,
        enabled: true as const,
        pairWithLane: "runtime_evidence" as const,
        protocol: "passive_baseline_with_sec_gpc" as const,
      }
    : undefined;
  if (gpcObservation && intent.orchestrationMode !== "sharded") {
    throw new Error("Durable GPC observation dispatch requires sharded Lambda orchestration.");
  }
  if (intent.contractVersion !== DISPATCH_CONTRACT_VERSION || intent.processor !== PROCESSOR) {
    throw new Error("Durable Lambda dispatch intent has an unsupported contract or processor.");
  }
  if (intent.scannerRuntime !== SCANNER_RUNTIME || intent.resultHandoff !== "sqs") {
    throw new Error("Durable Lambda dispatch intent has an unsupported runtime or result handoff.");
  }
  if (intent.vpcMode !== "none" && intent.vpcMode !== "vpc") {
    throw new Error("Durable Lambda dispatch intent has an unsupported VPC mode.");
  }
  return {
    artifactOnly: true as const,
    awsRegion: region,
    callbackCorrelationId: input.scanId,
    contractVersion: DISPATCH_CONTRACT_VERSION,
    functionName: requiredString(intent.functionName, "functionName"),
    ...(Object.keys(asRecord(intent.debugOverrides)).length > 0
      ? { debugOverrides: asRecord(intent.debugOverrides) }
      : {}),
    hostname: requiredString(input.scanConfig.hostname, "hostname"),
    localCallbackUrl: null,
    orchestrationMode: intent.orchestrationMode === "sharded" ? "sharded" as const : "single" as const,
    processor: PROCESSOR,
    ...(seeds.length > 0 ? { policySurfaceSeeds: seeds } : {}),
    ...postActionObservation,
    ...(gpcObservation ? { gpcObservation } : {}),
    productionFindingIntegration: false as const,
    profile: parallel.profile === "tiny" || input.scanConfig.profile === "tiny" ? "tiny" as const : "standard" as const,
    resultHandoff: "sqs" as const,
    resultPurpose: "persisted_scan" as const,
    resultQueueUrl: requiredString(intent.resultQueueUrl, "resultQueueUrl"),
    scanId: input.scanId,
    scannerRuntime: SCANNER_RUNTIME,
    targetEnvironment: intent.targetEnvironment === "production" ? "production" as const : "local" as const,
    targetUrl,
    vpcMode: intent.vpcMode,
  };
}

export async function claimLocalV2DagLambdaDispatches(input: {
  limit?: number;
  leaseToken: string;
}) {
  const leaseExpiresAt = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();
  const claimed = await query<ClaimedDispatch>(
    `with candidates as (
       select id
         from scans
        where status in ('queued', 'running')
          and scan_config_json #>> '{execution,v2DagLambda,simulatedLocalLambda}' = 'false'
          and (
            scan_config_json #>> '{execution,v2DagLambda,dispatchState}' = 'pending_dispatch'
            or (
              scan_config_json #>> '{execution,v2DagLambda,dispatchState}' in ('publishing', 'publish_retry')
              and coalesce(
                nullif(scan_config_json #>> '{execution,v2DagLambda,nextDispatchAttemptAt}', '')::timestamptz,
                nullif(scan_config_json #>> '{execution,v2DagLambda,dispatchLeaseExpiresAt}', '')::timestamptz,
                '-infinity'::timestamptz
              ) <= now()
            )
          )
        order by created_at asc
        limit $1
        for update skip locked
     )
     update scans s
        set scan_config_json = jsonb_set(
              s.scan_config_json,
              '{execution,v2DagLambda}',
              (coalesce(s.scan_config_json #> '{execution,v2DagLambda}', '{}'::jsonb) - 'nextDispatchAttemptAt') || jsonb_build_object(
                'dispatchState', 'publishing',
                'dispatchLeaseToken', $2::text,
                'dispatchLeaseExpiresAt', $3::text,
                'dispatchAttemptCount', coalesce((s.scan_config_json #>> '{execution,v2DagLambda,dispatchAttemptCount}')::int, 0) + 1
              ),
              true
            ),
            updated_at = now()
       from candidates
      where s.id = candidates.id
      returning s.id::text as scan_id,
                s.domain_id::text,
                s.organization_id::text,
                (s.scan_config_json #>> '{execution,v2DagLambda,dispatchAttemptCount}')::int as attempt_count,
                s.scan_config_json`,
    [Math.max(1, Math.min(25, input.limit ?? 10)), input.leaseToken, leaseExpiresAt]
  );
  return claimed.rows;
}

async function markAccepted(input: ClaimedDispatch & { leaseToken: string; messageId: string | null }) {
  await withWriteTransaction(async (client) => {
    const updated = await client.query(
      `update scans
          set scan_config_json = jsonb_set(
                scan_config_json,
                '{execution,v2DagLambda}',
                (scan_config_json #> '{execution,v2DagLambda}') - 'dispatchLeaseToken' - 'dispatchLeaseExpiresAt' - 'nextDispatchAttemptAt' || jsonb_build_object(
                  'acceptedAt', $3::text,
                  'dispatchState', 'accepted',
                  'dispatchTransport', 'sqs_fifo',
                  'sqsMessageId', $4::text
                ),
                true
              ),
              updated_at = now()
        where id = $1::uuid
          and scan_config_json #>> '{execution,v2DagLambda,dispatchLeaseToken}' = $2::text
        returning id`,
      [input.scan_id, input.leaseToken, new Date().toISOString(), input.messageId]
    );
    if (updated.rowCount !== 1) return;
    await client.query(
      `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
       values ($1::uuid, $2::uuid, $3::uuid, 'v2_lambda_dispatch.accepted',
               'Regional FIFO SQS accepted the v2 DAG Lambda scan dispatch.',
               jsonb_build_object(
                 'awsRegion', $4::text,
                 'dispatchAttemptCount', $5::int,
                 'dispatchTransport', 'sqs_fifo',
                 'sqsMessageId', $6::text,
                 'productionFindingIntegration', false
               ))`,
      [
        input.scan_id,
        input.domain_id,
        input.organization_id,
        asRecord(asRecord(input.scan_config_json.execution).v2DagLambda).awsRegion,
        input.attempt_count,
        input.messageId,
      ]
    );
  });
}

async function markRetry(input: ClaimedDispatch & { error: unknown; leaseToken: string }) {
  const delayMs = Math.min(MAX_RETRY_DELAY_MS, 1_000 * (2 ** Math.min(6, Math.max(0, input.attempt_count - 1))));
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  const errorMessage = (input.error instanceof Error ? input.error.message : String(input.error)).slice(0, 500);
  await query(
    `update scans
        set scan_config_json = jsonb_set(
              scan_config_json,
              '{execution,v2DagLambda}',
              (scan_config_json #> '{execution,v2DagLambda}') - 'dispatchLeaseToken' - 'dispatchLeaseExpiresAt' || jsonb_build_object(
                'dispatchState', 'publish_retry',
                'lastDispatchError', $3::text,
                'nextDispatchAttemptAt', $4::text
              ),
              true
            ),
            updated_at = now()
      where id = $1::uuid
        and scan_config_json #>> '{execution,v2DagLambda,dispatchLeaseToken}' = $2::text`,
    [input.scan_id, input.leaseToken, errorMessage, nextAttemptAt]
  );
}

export function startLocalV2DagLambdaDispatchPublisher(options: LocalV2DagLambdaDispatchPublisherOptions) {
  const configuredRegions = Object.entries(options.queueUrls).filter((entry): entry is [AwsRegion, string] => Boolean(entry[1]));
  if (!options.enabled || configuredRegions.length === 0) {
    console.info("[validation-worker] durable v2 DAG Lambda dispatch publisher disabled", {
      enabled: options.enabled,
      queueCount: configuredRegions.length,
    });
    return null;
  }

  const clients = new Map<AwsRegion, SQSClient>();
  let stopped = false;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function loop() {
    while (!stopped) {
      let claimedCount = 0;
      const leaseToken = randomUUID();
      try {
        // Three bounded 5s sends leave ample room inside the 30s claim lease,
        // including the acceptance transaction for the final item.
        const claimed = await claimLocalV2DagLambdaDispatches({ leaseToken, limit: 3 });
        claimedCount = claimed.length;
        for (const dispatch of claimed) {
          try {
            const payload = buildDurableLocalV2DagLambdaDispatchPayload({
              scanConfig: dispatch.scan_config_json,
              scanId: dispatch.scan_id,
            });
            const queueUrl = options.queueUrls[payload.awsRegion];
            if (!queueUrl) throw new Error(`No durable dispatch queue is configured for ${payload.awsRegion}.`);
            let client = clients.get(payload.awsRegion);
            if (!client) {
              client = new SQSClient({ region: payload.awsRegion });
              clients.set(payload.awsRegion, client);
            }
            const abortController = new AbortController();
            const timeout = setTimeout(() => {
              abortController.abort(new Error("Regional FIFO SQS dispatch acknowledgement deadline exceeded."));
            }, DISPATCH_SEND_TIMEOUT_MS);
            let sent;
            try {
              sent = await client.send(new SendMessageCommand({
                MessageBody: JSON.stringify(payload),
                MessageDeduplicationId: dispatch.scan_id,
                MessageGroupId: dispatch.scan_id,
                QueueUrl: queueUrl,
              }), { abortSignal: abortController.signal });
            } finally {
              clearTimeout(timeout);
            }
            await markAccepted({ ...dispatch, leaseToken, messageId: sent.MessageId ?? null });
          } catch (error) {
            await markRetry({ ...dispatch, error, leaseToken });
            console.warn("[validation-worker] durable v2 DAG Lambda dispatch will retry", {
              attemptCount: dispatch.attempt_count,
              error: error instanceof Error ? error.message : String(error),
              scanId: dispatch.scan_id,
            });
          }
        }
      } catch (error) {
        console.error("[validation-worker] durable v2 DAG Lambda dispatch publisher failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (claimedCount === 0) await sleep(options.pollMs);
    }
  }

  console.info("[validation-worker] durable v2 DAG Lambda dispatch publisher started", {
    pollMs: options.pollMs,
    regions: configuredRegions.map(([region]) => region),
  });
  void loop();
  return { stop() { stopped = true; } };
}
