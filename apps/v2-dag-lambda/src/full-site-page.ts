import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { z } from "zod";
import {
  inventoryHash,
  projectFullSiteInventory,
  runInventoryOnly,
  publicNetworkGuardEnabled,
} from "@certscore/scan-core";
import {
  crawlDisplayUrl,
  FULL_SITE_CONDITION,
  FULL_SITE_CONTRACT,
  type RobotsPolicy,
} from "@website-signal-risk-scanner/shared";

export const FULL_SITE_PAGE_DISPATCH = "certscore.full-site-page-dispatch.v1";
const messageSchema = z
  .object({
    contractVersion: z.literal(FULL_SITE_PAGE_DISPATCH),
    pageId: z.string().uuid(),
    attemptId: z.string().uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function runFullSitePage(event: unknown) {
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
    const response = await fetch(controlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...message, ...body }),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`Full site control plane returned ${response.status}`);
    return response.json();
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
    37000,
  );
  let packet;
  let evidenceBody: string;
  try {
    const visit = await runInventoryOnly({
      url: grant.url,
      region: grant.region,
      profile: grant.configuration.profile,
      hosts: grant.hosts,
      robots: grant.robots,
      waitMode: grant.configuration.waitMode,
      configurationHash: grant.configurationHash,
      outDir,
      signal: abort.signal,
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
      failureKind: visit.evidence.moduleRun.recoveryDiagnostics?.attempts?.some(
        (attempt) => attempt.outcome === "committed_timeout",
      )
        ? "navigation_timeout"
        : "collection_failure",
      status:
        visit.evidence.moduleRun.status === "completed" && visit.finalUrl
          ? "completed"
          : visit.evidence.moduleRun.status === "failed"
            ? "failed"
            : "partial",
      limitations: [
        ...visit.evidence.moduleRun.errors.map(
          () => "runtime_collection_limitation",
        ),
        ...(!visit.finalUrl ? ["page_context_unavailable"] : []),
      ],
    });
  } catch {
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
    await rm(outDir, { recursive: true, force: true });
  }
  const s3 = new S3Client({ region: grant.region });
  const prefix = `${grant.artifactPrefix}/${grant.pageId}/${grant.attemptId}`;
  const body = JSON.stringify(packet);
  if (
    Buffer.byteLength(body) > 16 * 1024 * 1024 ||
    Buffer.byteLength(evidenceBody) > 64 * 1024 * 1024
  )
    throw new Error("Inventory artifact exceeds retained byte limit.");
  await s3.send(
    new PutObjectCommand({
      Bucket: grant.bucket,
      Key: `${prefix}/evidence.json`,
      Body: evidenceBody,
      ContentType: "application/json",
    }),
    { abortSignal: AbortSignal.timeout(5000) },
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: grant.bucket,
      Key: `${prefix}/inventory.json`,
      Body: body,
      ContentType: "application/json",
    }),
    { abortSignal: AbortSignal.timeout(5000) },
  );
  await control({
    operation: "finish",
    sha256: inventoryHash(packet),
    sizeBytes: Buffer.byteLength(body),
    evidenceSizeBytes: Buffer.byteLength(evidenceBody),
  });
  return { status: "persisted" };
}
