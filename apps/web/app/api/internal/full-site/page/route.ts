import { NextResponse } from "next/server";
import { z } from "zod";
import {
  claimFullSitePage,
  completeFullSitePage,
  queryOne,
  readFullSiteArtifact,
} from "@website-signal-risk-scanner/db";
import {
  crawlObservationSchema,
  compactCrawlObservation,
} from "@website-signal-risk-scanner/shared";
const schema = z
  .object({
    operation: z.enum(["claim", "finish"]),
    contractVersion: z.literal("certscore.full-site-page-dispatch.v1"),
    pageId: z.string().uuid(),
    attemptId: z.string().uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    region: z.string().optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(16 * 1024 * 1024)
      .optional(),
    evidenceSizeBytes: z
      .number()
      .int()
      .positive()
      .max(64 * 1024 * 1024)
      .optional(),
  })
  .strict();
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 4096)
    return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  if (reader)
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4096) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
        parts.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  const raw = Buffer.concat(parts).toString("utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });
  const data = parsed.data;
  if (data.operation === "claim")
    return NextResponse.json(
      {
        grant: await claimFullSitePage({ ...data, region: data.region ?? "" }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  const { createHash } = await import("node:crypto");
  const row = await queryOne<{
    scan_id: string;
    configuration_hash: string;
    bucket: string;
    artifact_prefix: string;
    region: string;
    status: string;
  }>(
    `select c.scan_id,c.configuration_hash,c.bucket,c.artifact_prefix,c.region,p.status
    from full_site_pages p join full_site_crawls c on c.scan_id=p.scan_id where p.id=$1 and p.attempt_id=$2 and p.token_hash=$3`,
    [
      data.pageId,
      data.attemptId,
      createHash("sha256").update(data.token).digest("hex"),
    ],
  );
  if (!row) return new Response(null, { status: 403 });
  if (row.status !== "active") return NextResponse.json({ accepted: false });
  if (!data.sha256 || !data.sizeBytes || !data.evidenceSizeBytes)
    return new Response(null, { status: 400 });
  const prefix = `${row.artifact_prefix}/${data.pageId}/${data.attemptId}`;
  const packet = crawlObservationSchema.parse(
    await readFullSiteArtifact({
      bucket: row.bucket,
      key: `${prefix}/inventory.json`,
      region: row.region,
      sha256: data.sha256,
      sizeBytes: data.sizeBytes,
    }),
  );
  if (
    packet.parentScanId !== row.scan_id ||
    packet.pageJobId !== data.pageId ||
    packet.attemptId !== data.attemptId ||
    packet.configurationHash !== row.configuration_hash ||
    packet.executionProfile !== "inventory_only"
  )
    return new Response(null, { status: 409 });
  await readFullSiteArtifact({
    bucket: row.bucket,
    key: `${prefix}/evidence.json`,
    region: row.region,
    sha256: packet.sourceHash,
    sizeBytes: data.evidenceSizeBytes,
    maxBytes: 64 * 1024 * 1024,
  });
  const accepted = await completeFullSitePage({
    pageId: data.pageId,
    attemptId: data.attemptId,
    token: data.token,
    status: packet.status,
    observation: packet,
    compact: compactCrawlObservation(packet),
    finalUrl: packet.finalUrl,
    failureKind: packet.failureKind,
    retryAfterSeconds: packet.retryAfterSeconds,
    artifact: {
      bucket: row.bucket,
      key: `${prefix}/inventory.json`,
      sha256: data.sha256,
      sizeBytes: data.sizeBytes,
      evidenceKey: `${prefix}/evidence.json`,
      sourceHash: packet.sourceHash,
    },
  });
  return NextResponse.json(
    { accepted },
    { headers: { "Cache-Control": "no-store" } },
  );
}
