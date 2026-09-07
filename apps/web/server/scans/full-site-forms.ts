import "server-only";
import { createHash } from "node:crypto";
import { collectionSurfaceInventorySchema, collectionSurfaceSnapshotSchema } from "@certscore/contracts";
import { loadFullSiteCrawl, loadFullSitePages, query, readFullSiteArtifact } from "@website-signal-risk-scanner/db";
import { crawlObservationSchema } from "@website-signal-risk-scanner/shared";

export async function loadFullSiteFormSnapshot(scanId: string, pageId: string, formRef: string) {
  if (!/^[a-f0-9-]{36}$/i.test(pageId) || !/^collection_form_\d+$/.test(formRef)) return null;
  const crawl = await loadFullSiteCrawl(scanId);
  const [page] = await loadFullSitePages(scanId, pageId);
  if (!crawl || !page || !["completed", "partial"].includes(page.status)) return null;
  const parsed = crawlObservationSchema.safeParse(page.observation_json);
  if (!parsed.success) return null;
  const observation = parsed.data;
  const collection = observation.collectionSurfaces;
  if (!collection?.sourceSizeBytes || observation.parentScanId !== scanId || observation.pageJobId !== pageId || observation.configurationHash !== crawl.configuration_hash) return null;
  const metadata = collection.snapshots.find(snapshot => snapshot.formRef === formRef && snapshot.status === "available");
  if (!metadata) return null;
  let bucket: string, key: string;
  if (observation.executionProfile === "homepage_baseline") {
    const { rows: [event] } = await query<{ metadata_json: { artifactPointers?: { scanArtifactUri?: string }; artifactMetadata?: { scanArtifactUri?: { sha256: string; sizeBytes: number } } } }>(
      "select metadata_json from scan_events where scan_id=$1 and event_type='v2_lambda_result.received' and metadata_json->>'resultStatus'='completed' order by created_at desc limit 1", [scanId]);
    const pointer = event?.metadata_json.artifactPointers?.scanArtifactUri;
    const retained = event?.metadata_json.artifactMetadata?.scanArtifactUri;
    if (!pointer?.startsWith("s3://") || retained?.sha256 !== observation.sourceHash || retained.sizeBytes !== collection.sourceSizeBytes) return null;
    const uri = new URL(pointer); bucket = uri.hostname; key = uri.pathname.slice(1);
  } else {
    if (observation.attemptId !== page.attempt_id) return null;
    const { rows: [attempt] } = await query<{ artifact_json: { bucket: string; evidenceKey: string; sourceHash: string } }>(
      "select artifact_json from full_site_attempts where id=$1 and page_id=$2 and status in ('completed','partial')", [observation.attemptId, pageId]);
    const artifact = attempt?.artifact_json;
    const expectedKey = `${crawl.artifact_prefix}/${pageId}/${observation.attemptId}/evidence.json`;
    if (!artifact || artifact.bucket !== crawl.bucket || artifact.evidenceKey !== expectedKey || artifact.sourceHash !== observation.sourceHash) return null;
    bucket = artifact.bucket; key = artifact.evidenceKey;
  }
  const raw = await readFullSiteArtifact({ bucket, key, region: crawl.region, sha256: observation.sourceHash, sizeBytes: collection.sourceSizeBytes, maxBytes: 64 * 1024 * 1024 }) as { scanId?: string; collectionSurfaceInventory?: unknown; collectionSurfaceSnapshots?: unknown[] };
  if (observation.executionProfile === "homepage_baseline" && raw.scanId !== scanId) return null;
  const inventory = collectionSurfaceInventorySchema.safeParse(raw.collectionSurfaceInventory);
  if (!inventory.success || JSON.stringify(inventory.data) !== JSON.stringify(collection.inventory)) return null;
  const inventoryHash = createHash("sha256").update(JSON.stringify(inventory.data)).digest("hex");
  for (const candidate of raw.collectionSurfaceSnapshots ?? []) {
    const parsedSnapshot = collectionSurfaceSnapshotSchema.safeParse(candidate);
    if (!parsedSnapshot.success) continue;
    const snapshot = parsedSnapshot.data;
    if (snapshot.formRef !== formRef || snapshot.status !== "available" || snapshot.sourceInventoryHash !== inventoryHash || snapshot.pageUrl !== inventory.data.pageUrl || !snapshot.data || snapshot.sha256 !== metadata.sha256) continue;
    const bytes = Buffer.from(snapshot.data, "base64");
    if (bytes.length !== snapshot.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== snapshot.sha256 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    return bytes;
  }
  return null;
}
