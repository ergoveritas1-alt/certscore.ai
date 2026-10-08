import { createOpenAiScreenshotSafetyClassifier } from "./screenshot-safety";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { z } from "zod";
import {
  inventoryHash,
  projectFullSiteInventory,
  runInventoryOnly,
  publicNetworkGuardEnabled,
  proxyFetch,
} from "@certscore/scan-core";
import {
  crawlDisplayUrl,
  FULL_SITE_ARTIFACT_LIMITS,
  FULL_SITE_CONDITION,
  FULL_SITE_CONTRACT,
  type RobotsPolicy,
} from "@website-signal-risk-scanner/shared";

import { FULL_SITE_PAGE_DISPATCH } from "./full-site-dispatch-contract.js";
export { FULL_SITE_PAGE_DISPATCH } from "./full-site-dispatch-contract.js";

/** Failure hints describe actual capture failures, never a successful visit's default. */
export function fullSitePageCaptureOutcome(input: {
  aborted: boolean;
  finalUrl: string | null;
  moduleRun: Awaited<ReturnType<typeof runInventoryOnly>>["evidence"]["moduleRun"];
}) {
  const status = !input.aborted && input.moduleRun.status === "completed" && input.finalUrl
    ? "completed" as const
    : input.moduleRun.status === "failed" ? "failed" as const : "partial" as const;
  const failureKind = input.moduleRun.recoveryDiagnostics?.attempts?.some(attempt => attempt.outcome === "committed_timeout")
    ? "navigation_timeout" as const
    : status === "failed" ? "collection_failure" as const : undefined;
  return { status, failureKind };
}

const messageSchema = z
  .object({
    contractVersion: z.literal(FULL_SITE_PAGE_DISPATCH),
    pageId: z.string().uuid(),
    attemptId: z.string().uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function dispatchFullSitePage(event: unknown) {
  const message = messageSchema.parse(event);
  if (process.env.CERTSCORE_FULL_SITE_INVENTORY_WORKER === "1")
    return runFullSitePage(message);
  const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (!functionName || functionName.endsWith("-inventory"))
    throw new Error("Inventory worker routing unavailable.");
  // Reuse the durable dispatch queue, but do not run a browser or wait for a child here.
  // Async retries are disabled in Terraform; the persisted attempt lease owns recovery.
  const response = await new LambdaClient({
    region: process.env.AWS_REGION,
  }).send(
    new InvokeCommand({
      FunctionName: `${functionName}-inventory`,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify(message)),
    }),
    { abortSignal: AbortSignal.timeout(2000) },
  );
  if (response.StatusCode !== 202)
    throw new Error("Inventory dispatch was not accepted.");
  return { status: "dispatched" };
}

export async function requestFullSiteControl(controlUrl: URL, message: z.infer<typeof messageSchema>, body: Record<string, unknown>, invocationDeadline: number) {
  const controlStartedAt = Date.now();
  const remainingMs = invocationDeadline - controlStartedAt;
  // Finish is the last operation: use the remaining publication budget rather
  // than imposing a second deadline before verified persistence can acknowledge.
  const timeoutMs = body.operation === "claim" ? Math.min(3000, remainingMs) : remainingMs;
  if (timeoutMs <= 0) throw new Error("Inventory publication deadline reached.");
  const operationDeadline = controlStartedAt + timeoutMs;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let httpStatus: number | null = null;
    let retryable = false;
    try {
      const remaining = operationDeadline - Date.now();
      if (remaining <= 0) throw new Error("Inventory publication deadline reached.");
      const response = await proxyFetch(controlUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...message, ...body }),
        signal: AbortSignal.timeout(remaining),
        redirect: "error",
      });
      httpStatus = response.status;
      if (!response.ok) {
        retryable = [502, 503, 504].includes(response.status);
        await response.body?.cancel();
        throw new Error(`Full site control plane returned ${response.status}`);
      }
      const result = await response.json();
      if (body.operation === "finish" && result.accepted !== true)
        throw new Error("Full site result was not accepted.");
      if (body.operation === "finish" || attempt > 1) console.info(JSON.stringify({ event: "full_site_control_completed",
        page_id: message.pageId, attempt_id: message.attemptId, operation: body.operation,
        elapsed_ms: Date.now() - controlStartedAt, http_status: httpStatus, request_count: attempt }));
      return result;
    } catch (error) {
      // Retry only transient transport failures, never permission, validation,
      // application rejection, or a used deadline. The credential and body are identical.
      const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
      retryable ||= httpStatus === null && (["ECONNRESET", "EPIPE", "ETIMEDOUT", "UND_ERR_SOCKET"].includes(code ?? "") ||
        (error instanceof Error && /^Egress proxy CONNECT failed with HTTP (502|503|504)$/.test(error.message)));
      const retry = attempt === 1 && retryable && operationDeadline - Date.now() > 100;
      console.error(JSON.stringify({ event: retry ? "full_site_control_retry" : "full_site_control_failed", page_id: message.pageId,
        attempt_id: message.attemptId, operation: body.operation, elapsed_ms: Date.now() - controlStartedAt, http_status: httpStatus,
        request_count: attempt, error_name: error instanceof Error ? error.name.slice(0, 80) : "UnknownError" }));
      if (!retry) throw error;
    }
  }
  throw new Error("Full site control retry exhausted.");
}

export async function runFullSitePage(event: unknown, options: { s3Client?: S3Client; control?: (body: Record<string, unknown>) => Promise<any> } = {}) {
  if (process.env.CERTSCORE_FULL_SITE_INVENTORY_WORKER !== "1")
    throw new Error("Inventory requires its dedicated worker.");
  const invocationDeadline = Date.now() + 24000;
  const remaining = (cap: number, reserve = 0) => {
    const ms = Math.min(cap, invocationDeadline - Date.now() - reserve);
    if (ms <= 0) throw new Error("Inventory publication deadline reached.");
    return ms;
  };
  const message = messageSchema.parse(event);
  if (!publicNetworkGuardEnabled())
    throw new Error("Inventory worker requires the public network guard.");
  // The queue contains no URL, limits, or callback address. All are retrieved using the one-use persisted attempt credential.
  const origin =
    process.env.CERTSCORE_FULL_SITE_CONTROL_ORIGIN ?? "https://certscore.ai";
  if (
    new URL(origin).protocol !== "https:" &&
    process.env.NODE_TEST_CONTEXT === undefined
  )
    throw new Error("Full site control plane requires HTTPS.");
  const controlUrl = new URL("/api/internal/full-site/page", origin);
  async function control(body: Record<string, unknown>) {
    if (options.control) return options.control(body);
    return requestFullSiteControl(controlUrl, message, body, invocationDeadline);
  }
  const admitted = await control({
    operation: "claim",
    region: process.env.AWS_REGION,
  });
  if (!admitted.grant) return { status: "not_admitted" };
  const grant = admitted.grant as {
    scanId: string;
    pageId: string;
    attemptId: string;
    url: string;
    hosts: string[];
    region: string;
    configurationHash: string;
    robots: RobotsPolicy;
    configuration: { profile: "standard" | "tiny"; waitMode: "fast" | "full" };
    bucket: string;
    artifactPrefix: string;
  };
  if (
    grant.region !== process.env.AWS_REGION ||
    grant.pageId !== message.pageId ||
    grant.attemptId !== message.attemptId
  )
    throw new Error("Full site grant identity mismatch.");
  const outDir = `/tmp/full-site-${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const abort = new AbortController();
  const deadline = setTimeout(
    () => abort.abort(new Error("Inventory page deadline reached.")),
    remaining(20000, 4000),
  );
  let packet;
  let evidenceBody: string;
  try {
    const visit = await runInventoryOnly({
      parentScanId: grant.scanId,
      url: grant.url,
      region: grant.region,
      profile: grant.configuration.profile,
      hosts: grant.hosts,
      robots: grant.robots,
      waitMode: grant.configuration.waitMode,
      configurationHash: grant.configurationHash,
      outDir,
      signal: abort.signal,
      runtimeGraph: { pageId: grant.pageId, attemptId: grant.attemptId },
      formSnapshotReviewer: createOpenAiScreenshotSafetyClassifier(),
    });
    evidenceBody = JSON.stringify(visit.evidence);
    packet = projectFullSiteInventory({
      ...visit,
      parentScanId: grant.scanId,
      pageJobId: grant.pageId,
      attemptId: grant.attemptId,
      configurationHash: grant.configurationHash,
      requestedUrl: grant.url,
      profile: "inventory_only",
      sourceHash: inventoryHash(visit.evidence),
      ...fullSitePageCaptureOutcome({ aborted: abort.signal.aborted, finalUrl: visit.finalUrl, moduleRun: visit.evidence.moduleRun }),
      limitations: [
        ...(abort.signal.aborted ? ["observation_deadline"] : []),
        ...visit.evidence.moduleRun.errors.map(
          () => "runtime_collection_limitation",
        ),
        ...(!visit.finalUrl ? ["page_context_unavailable"] : []),
      ],
    });
    if (packet.collectionSurfaces) packet.collectionSurfaces.sourceSizeBytes = Buffer.byteLength(evidenceBody);
    if (visit.evidence.runtimeEvidenceGraph) {
      const graph = visit.evidence.runtimeEvidenceGraph;
      packet.runtimeGraph = { sourceSizeBytes: Buffer.byteLength(evidenceBody), sha256: graph.sourceHash, nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
    }
  } catch (error) {
    if (options.control) console.error("[local-inventory] collection failed", error instanceof Error ? error.message : "Unknown error");
    evidenceBody = "{}";
    packet = {
      contractVersion: FULL_SITE_CONTRACT,
      parentScanId: grant.scanId,
      pageJobId: grant.pageId,
      attemptId: grant.attemptId,
      executionProfile: "inventory_only",
      condition: FULL_SITE_CONDITION,
      configurationHash: grant.configurationHash,
      requestedUrl: crawlDisplayUrl(grant.url),
      finalUrl: null,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "failed",
      limitations: ["inventory_observation_failed"],
      sourceHash: inventoryHash({}),
      occurrences: [],
      links: [],
      redirects: [],
      httpStatus: null,
      retryAfterSeconds: null,
      failureKind: "collection_failure",
    };
  } finally {
    clearTimeout(deadline);
    // Cleanup must not consume the artifact/publication reserve.
    void rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
  const s3 = options.s3Client ?? new S3Client({ region: grant.region });
  const prefix = `${grant.artifactPrefix}/${grant.pageId}/${grant.attemptId}`;
  const body = JSON.stringify(packet);
  if (
    Buffer.byteLength(body) > FULL_SITE_ARTIFACT_LIMITS.inventory ||
    Buffer.byteLength(evidenceBody) > FULL_SITE_ARTIFACT_LIMITS.evidence
  )
    throw new Error("Inventory artifact exceeds retained byte limit.");
  await Promise.all(
    [
      ["evidence.json", evidenceBody],
      ["inventory.json", body],
    ].map(([name, content]) =>
      s3.send(
        new PutObjectCommand({
          Bucket: grant.bucket,
          Key: `${prefix}/${name}`,
          Body: content,
          ContentType: "application/json",
        }),
        { abortSignal: AbortSignal.timeout(remaining(1800, 1500)) },
      ),
    ),
  );
  await control({
    operation: "finish",
    sha256: inventoryHash(packet),
    sizeBytes: Buffer.byteLength(body),
    evidenceSizeBytes: Buffer.byteLength(evidenceBody),
  });
  return { status: "persisted" };
}
