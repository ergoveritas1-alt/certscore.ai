import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  postRefusalEvidencePacketSchema,
  type PostRefusalEvidencePacket,
} from "../packages/certscore-contracts/src/index.js";
import { canonicalSha256 } from "../packages/certscore-scan-core/src/index.js";
import { publicTestContactHoldForUrl } from "../packages/certscore-scan-core/src/public-test-contact-holds.js";
import { parseSingleJsonOutput, runProdDbSqlOneoff } from "./lib/prod-db-psql-oneoff.js";

const SOURCE_COHORT_SIZE = 339;
const EXPECTED_SOURCE_COUNTS: Record<string, number> = {
  confirmed: 10,
  redirect_target_not_authorized: 258,
  deterministic_reject_control_not_found: 30,
  cmp_rejection_state_not_observed: 23,
  multiple_deterministic_reject_controls_found: 15,
  target_navigation_failed: 3,
};
const FAILURE_QUOTAS: Record<string, number> = {
  redirect_target_not_authorized: 39,
  deterministic_reject_control_not_found: 5,
  cmp_rejection_state_not_observed: 3,
  multiple_deterministic_reject_controls_found: 2,
  target_navigation_failed: 1,
};
const DISALLOWED_DOMAINS = ["vercel.com"];
const DISALLOWED_PATH_SEGMENTS = new Set([
  "account", "auth", "cart", "checkout", "login", "payment", "purchase",
  "register", "session", "signin", "signup",
]);
const REGION = "eu-west-1";
const FUNCTION_NAME = "certscore-v2-dag-local-lambda";

type SourceRow = {
  completed_at: string;
  cooldown_until: string | null;
  effective_state: string | null;
  hostname: string;
  last_contact_at: string | null;
  packet_uri: string | null;
  scan_id: string;
};

type SourceRecord = SourceRow & {
  packet: PostRefusalEvidencePacket;
  sourceOutcome: string;
};

type SelectedRecord = SourceRecord & {
  exactTargetUrl: string;
  normalizedDomain: string;
};

type Args = {
  concurrency: number;
  execute: boolean;
  limit: number;
  outDir: string;
  prepareContacts: boolean;
  runKey: string;
};

function sourceQuery() {
  return `select coalesce(jsonb_agg(to_jsonb(q) order by q.completed_at desc), '[]'::jsonb)::text
from (
  select s.id::text as scan_id,
         s.completed_at::text as completed_at,
         d.hostname,
         coalesce(
           se.metadata_json #>> '{artifactPointers,postRefusalPacketUri}',
           se.metadata_json #>> '{artifact_pointers,postRefusalPacketUri}',
           se.metadata_json ->> 'postRefusalPacketUri'
         ) as packet_uri,
         ledger.last_contact_at::text,
         ledger.cooldown_until::text,
         coalesce(ledger.manual_state, ledger.automatic_state) as effective_state
    from public.scans s
    join public.domains d on d.id = s.domain_id
    join public.scan_snapshots ss on ss.scan_id = s.id
    left join public.scan_domain_contact_ledger ledger
      on ledger.normalized_domain = public.normalize_scan_contact_domain(d.hostname)
    left join lateral (
      select event.metadata_json
        from public.scan_events event
       where event.scan_id = s.id
         and event.event_type = 'v2_lambda_result.received'
       order by event.created_at desc
       limit 1
    ) se on true
   where s.completed_at >= now() - interval '48 hours'
     and s.status = 'completed'
     and s.scan_config_json->>'processor' = 'local-certscore-v2-dag-parallel-v1'
     and ss.consent_reject_observed is true
     and coalesce(
       se.metadata_json #>> '{artifactPointers,postRefusalPacketUri}',
       se.metadata_json #>> '{artifact_pointers,postRefusalPacketUri}',
       se.metadata_json ->> 'postRefusalPacketUri'
     ) is not null
   order by s.completed_at desc
   limit 450
) q`;
}

function sourceOutcome(packet: PostRefusalEvidencePacket) {
  if (packet.refusalRegistration.status === "confirmed" &&
      packet.refusalRegistration.refusalExercised && packet.productionProjectable) {
    return "confirmed";
  }
  return packet.refusalRegistration.reason ?? packet.resolver.reason ?? packet.refusalRegistration.status;
}

function counts(records: SourceRecord[]) {
  const result: Record<string, number> = {};
  for (const record of records) result[record.sourceOutcome] = (result[record.sourceOutcome] ?? 0) + 1;
  return result;
}

function cohortMatches(records: SourceRecord[]) {
  const actual = counts(records);
  return Object.entries(EXPECTED_SOURCE_COUNTS).every(([key, value]) => actual[key] === value) &&
    Object.values(actual).reduce((sum, value) => sum + value, 0) === SOURCE_COHORT_SIZE;
}

function findAnchoredCohort(records: SourceRecord[]) {
  const diagnostics: Array<{ counts: Record<string, number>; newest: string; oldest: string; distance: number }> = [];
  const countAnchoredCandidates: SourceRecord[][] = [];
  for (const newest of records) {
    const upper = Date.parse(newest.completed_at) + 1;
    const lower = upper - 24 * 60 * 60 * 1_000;
    const candidate = records.filter((record) => {
      const completedAt = Date.parse(record.completed_at);
      return completedAt >= lower && completedAt < upper;
    });
    if (candidate.length === SOURCE_COHORT_SIZE) {
      countAnchoredCandidates.push(candidate);
      if (cohortMatches(candidate)) return candidate;
      const actual = counts(candidate);
      diagnostics.push({
        counts: actual,
        newest: candidate[0]!.completed_at,
        oldest: candidate.at(-1)!.completed_at,
        distance: Object.entries(EXPECTED_SOURCE_COUNTS).reduce(
          (sum, [key, value]) => sum + Math.abs((actual[key] ?? 0) - value),
          0,
        ),
      });
    }
  }
  for (let start = 0; start + SOURCE_COHORT_SIZE <= records.length; start += 1) {
    const candidate = records.slice(start, start + SOURCE_COHORT_SIZE);
    if (cohortMatches(candidate)) return candidate;
  }
  if (countAnchoredCandidates.length === 1) return countAnchoredCandidates[0]!;
  throw new Error(`Could not reproduce the anchored 339-scan cohort. Nearest 24-hour windows: ${JSON.stringify(
    diagnostics.toSorted((left, right) => left.distance - right.distance).slice(0, 5),
  )}. Available counts: ${JSON.stringify(counts(records))}`);
}

function sanitizeTarget(value: string) {
  let target: URL;
  try { target = new URL(value); } catch { return null; }
  if (target.protocol !== "https:" || target.username || target.password || (target.port && target.port !== "443")) return null;
  const hostname = target.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return null;
  if (DISALLOWED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) return null;
  if (target.pathname.toLowerCase().split("/").filter(Boolean).some((segment) => DISALLOWED_PATH_SEGMENTS.has(segment))) return null;
  target.hostname = hostname;
  target.port = "";
  target.hash = "";
  target.search = "";
  return target.toString();
}

function select(records: SourceRecord[], limit: number) {
  const eligible: SelectedRecord[] = [];
  const exclusions: Array<{ scanId: string; reason: string }> = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (record.sourceOutcome === "confirmed") continue;
    const exactTargetUrl = sanitizeTarget(record.packet.targetUrl);
    if (!exactTargetUrl) {
      exclusions.push({ scanId: record.scan_id, reason: "unsafe_or_disallowed_target" });
      continue;
    }
    const normalizedDomain = new URL(exactTargetUrl).hostname.replace(/^www\./, "");
    if (seen.has(normalizedDomain)) continue;
    if (record.effective_state === "blocked" || record.effective_state === "do_not_calibrate") {
      exclusions.push({ scanId: record.scan_id, reason: "central_ledger_blocked" });
      continue;
    }
    const hold = publicTestContactHoldForUrl(exactTargetUrl);
    if (hold) {
      exclusions.push({ scanId: record.scan_id, reason: `repository_hold:${hold.reason}` });
      continue;
    }
    seen.add(normalizedDomain);
    eligible.push({ ...record, exactTargetUrl, normalizedDomain });
  }

  const selected: SelectedRecord[] = [];
  const selectedIds = new Set<string>();
  for (const [reason, quota] of Object.entries(FAILURE_QUOTAS)) {
    for (const record of eligible.filter((candidate) => candidate.sourceOutcome === reason).slice(0, quota)) {
      selected.push(record);
      selectedIds.add(record.scan_id);
    }
  }
  for (const record of eligible) {
    if (selected.length >= limit) break;
    if (!selectedIds.has(record.scan_id)) selected.push(record);
  }
  if (selected.length !== limit) throw new Error(`Only ${selected.length} distinct safe failed targets were available; required ${limit}.`);
  return { eligible, exclusions, selected };
}

function s3Location(uri: string) {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error(`Unsupported S3 URI: ${uri}`);
  return { bucket: match[1]!, key: match[2]! };
}

const s3Clients = new Map<string, S3Client>();
function s3ClientForBucket(bucket: string) {
  const region = bucket.match(/(eu-central-1|eu-west-1|us-west-1)/)?.[1] ?? REGION;
  const existing = s3Clients.get(region);
  if (existing) return existing;
  const client = new S3Client({ region });
  s3Clients.set(region, client);
  return client;
}

async function readPacket(uri: string) {
  const { bucket, key } = s3Location(uri);
  const response = await s3ClientForBucket(bucket).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const text = await response.Body?.transformToString();
  if (!text) throw new Error(`Empty packet: ${uri}`);
  return postRefusalEvidencePacketSchema.parse(JSON.parse(text));
}

function parentPayload(scanId: string, targetUrl: string) {
  const target = new URL(targetUrl);
  return {
    artifactOnly: true as const,
    awsRegion: REGION,
    callbackCorrelationId: scanId,
    contractVersion: "certscore.v2.lambda-dag-dispatch.v1" as const,
    functionName: FUNCTION_NAME,
    hostname: target.hostname,
    localCallbackUrl: null,
    orchestrationMode: "sharded" as const,
    postRefusalObservation: {
      enabled: true,
      rolloutMode: "all_eligible" as const,
      dispatchDelayMs: 500,
      observationWindowMs: 8_000,
      confirmationTimeoutMs: 2_000,
      actionSearchTimeoutMs: 2_500,
      resolver: { kind: "canonical_cmp_registry" as const, recipeSetId: "canonical-consent-control-reject-v20" },
      interactionAuthorization: {
        authorizationId: "sharded_scan_resolved_exact_target.v2" as const,
        kind: "scan_target_resolution" as const,
        maxRedirects: 5,
        requestedUrl: targetUrl,
        resolutionTimeoutMs: 1_500,
        scanId,
      },
    },
    processor: "local-certscore-v2-dag-parallel-v1" as const,
    productionFindingIntegration: false as const,
    profile: "tiny" as const,
    resultHandoff: "sqs" as const,
    resultPurpose: "synthetic_verification" as const,
    resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/199536052647/certscore-v2-dag-local-production-results",
    scanId,
    scannerRuntime: "certscore-v2-dag-parallel-path" as const,
    targetEnvironment: "production" as const,
    targetUrl,
    vpcMode: "vpc" as const,
  };
}

function parentHash(payload: ReturnType<typeof parentPayload>) {
  return canonicalSha256(payload);
}

async function invoke(record: SelectedRecord, runKey: string) {
  const startedAt = new Date().toISOString();
  const scanId = `reject-calibration-${runKey}-${randomUUID()}`.slice(0, 160);
  const parent = parentPayload(scanId, record.exactTargetUrl);
  const payload = {
    ...parent,
    orchestrationMode: "worker",
    parentDispatchSha256: parentHash(parent),
    postRefusalObservation: { ...parent.postRefusalObservation, dispatchDelayMs: 0 },
    workerLane: "reject_observation",
  };
  const lambda = new LambdaClient({ region: REGION });
  const response = await lambda.send(new InvokeCommand({
    FunctionName: FUNCTION_NAME,
    InvocationType: "RequestResponse",
    Payload: Buffer.from(JSON.stringify(payload)),
  }));
  const raw = response.Payload ? Buffer.from(response.Payload).toString("utf8") : "";
  if (response.FunctionError) throw new Error(`Lambda ${response.FunctionError}: ${raw.slice(0, 500)}`);
  const result = JSON.parse(raw) as {
    artifactPointers?: { postRefusalPacketUri?: string };
    error?: { message?: string };
    scannerGitSha?: string;
    scannerImageTag?: string;
    status?: string;
  };
  const uri = result.artifactPointers?.postRefusalPacketUri;
  if (!uri) throw new Error(result.error?.message ?? `Reject worker returned no packet: ${raw.slice(0, 500)}`);
  const packet = await readPacket(uri);
  return {
    completedAt: new Date().toISOString(),
    exactTargetUrl: record.exactTargetUrl,
    newOutcome: sourceOutcome(packet),
    normalizedDomain: record.normalizedDomain,
    observationCount: packet.observations.length,
    packetUri: uri,
    productionProjectable: packet.productionProjectable,
    refusalExercised: packet.refusalRegistration.refusalExercised,
    scanId,
    scannerGitSha: result.scannerGitSha ?? null,
    scannerImageTag: result.scannerImageTag ?? null,
    sourceCompletedAt: record.completed_at,
    sourceOutcome: record.sourceOutcome,
    sourceScanId: record.scan_id,
    startedAt,
    status: result.status ?? "unknown",
  };
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, task: (value: T, index: number) => Promise<R>) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await task(values[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    concurrency: 5,
    execute: false,
    limit: 50,
    outDir: "artifacts/scan-quality-calibration/2026-08-30-reject-path-50",
    prepareContacts: false,
    runKey: "reject-path-v2-50-20260830",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--execute") { parsed.execute = true; continue; }
    if (arg === "--prepare-contacts") { parsed.prepareContacts = true; continue; }
    const value = argv[++index];
    if (!value) throw new Error(`Missing value for ${arg}`);
    if (arg === "--concurrency") parsed.concurrency = Number(value);
    else if (arg === "--limit") parsed.limit = Number(value);
    else if (arg === "--out-dir") parsed.outDir = value;
    else if (arg === "--run-key") parsed.runKey = value;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(parsed.limit) || parsed.limit !== 50) throw new Error("This calibration is fixed at exactly 50 targets.");
  if (!Number.isInteger(parsed.concurrency) || parsed.concurrency < 1 || parsed.concurrency > 8) throw new Error("--concurrency must be 1-8");
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(args.outDir);
  await mkdir(outputDir, { recursive: true });
  const sourceCachePath = path.join(outputDir, "RejectPathSourceRecords.cache.json");
  const withPackets = await readFile(sourceCachePath, "utf8")
    .then((value) => JSON.parse(value) as SourceRecord[])
    .catch(async () => {
      const queryOutput = await runProdDbSqlOneoff({ marker: "REJECT_339_SOURCE", readOnly: true, sql: sourceQuery() });
      const rows = parseSingleJsonOutput<SourceRow[]>(queryOutput);
      const records = await mapConcurrent(rows.filter((row) => row.packet_uri), 12, async (row) => {
        const packet = await readPacket(row.packet_uri!);
        return { ...row, packet, sourceOutcome: sourceOutcome(packet) };
      });
      await writeFile(sourceCachePath, `${JSON.stringify(records)}\n`);
      return records;
    });
  const cohort = findAnchoredCohort(withPackets);
  const selection = select(cohort, args.limit);
  const selectionArtifact = {
    artifactVersion: "certscore.reject_path_prod_cohort_selection.v1",
    generatedAt: new Date().toISOString(),
    initiatesTargetContact: false,
    sourceCohortCount: cohort.length,
    sourceCounts: counts(cohort),
    sourceWindow: { newest: cohort[0]?.completed_at, oldest: cohort.at(-1)?.completed_at },
    requestedCount: args.limit,
    selectedCount: selection.selected.length,
    region: REGION,
    cooldownOverride: {
      authorizedBy: "product_owner",
      authorizedInCurrentTask: true,
      scope: "one immediate rescan of each of 50 selected targets",
    },
    exclusions: selection.exclusions,
    selected: selection.selected.map((record) => ({
      exactTargetUrl: record.exactTargetUrl,
      normalizedDomain: record.normalizedDomain,
      sourceCompletedAt: record.completed_at,
      sourceOutcome: record.sourceOutcome,
      sourceScanId: record.scan_id,
    })),
  };
  await writeFile(path.join(outputDir, "RejectPath50Selection.json"), `${JSON.stringify(selectionArtifact, null, 2)}\n`);
  console.log(JSON.stringify({ cohortCounts: counts(cohort), selectedCounts: counts(selection.selected), selectedCount: selection.selected.length }, null, 2));
  if (args.prepareContacts) {
    const completed = JSON.parse(await readFile(path.join(outputDir, "RejectPath50Results.json"), "utf8")) as {
      generatedAt: string;
      results: Array<{
        completedAt: string;
        exactTargetUrl: string;
        newOutcome: string;
        startedAt?: string;
      }>;
    };
    await writeFile(path.join(outputDir, "CalibrationContactManifest.json"), `${JSON.stringify({
      targets: completed.results.map((result) => ({ url: result.exactTargetUrl })),
    }, null, 2)}\n`);
    await writeFile(path.join(outputDir, "CalibrationContactSummary.json"), `${JSON.stringify({
      generatedAt: completed.generatedAt,
      results: completed.results.map((result) => ({
        completedAt: result.completedAt,
        runtime: { noGoCandidate: false, noGoReasons: [] },
        scannerRuntimeStarted: true,
        startedAt: result.startedAt ?? result.completedAt,
        status: result.newOutcome === "invocation_failed" ? "failed" : "completed",
        url: result.exactTargetUrl,
      })),
    }, null, 2)}\n`);
    console.log("Prepared central contact-ledger inputs for 50 attempted targets.");
    return;
  }
  if (!args.execute) return;

  const resultsPath = path.join(outputDir, "RejectPath50Results.json");
  const prior = await readFile(resultsPath, "utf8").then((value) => JSON.parse(value) as { results?: unknown[] }).catch(() => ({ results: [] }));
  if ((prior.results?.length ?? 0) > 0) throw new Error("Results already exist; refusing to contact targets twice.");
  const results = await mapConcurrent(selection.selected, args.concurrency, async (record, index) => {
    try {
      const result = await invoke(record, args.runKey);
      console.log(`[${index + 1}/${selection.selected.length}] ${record.normalizedDomain}: ${result.newOutcome}`);
      return result;
    } catch (error) {
      const failure = {
        completedAt: new Date().toISOString(),
        exactTargetUrl: record.exactTargetUrl,
        newOutcome: "invocation_failed",
        normalizedDomain: record.normalizedDomain,
        sourceCompletedAt: record.completed_at,
        sourceOutcome: record.sourceOutcome,
        sourceScanId: record.scan_id,
        error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      };
      console.log(`[${index + 1}/${selection.selected.length}] ${record.normalizedDomain}: invocation_failed`);
      return failure;
    }
  });
  const resultCounts = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.newOutcome] = (acc[result.newOutcome] ?? 0) + 1;
    return acc;
  }, {});
  await writeFile(resultsPath, `${JSON.stringify({
    artifactVersion: "certscore.reject_path_prod_cohort_results.v1",
    generatedAt: new Date().toISOString(),
    runKey: args.runKey,
    region: REGION,
    sourceCohortCount: cohort.length,
    selectedCount: selection.selected.length,
    resultCounts,
    results,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ resultCounts }, null, 2));
}

if (process.argv[1]?.endsWith("run-prod-reject-path-cohort-rescan.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
