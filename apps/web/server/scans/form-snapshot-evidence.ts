import { createHash } from "node:crypto";
import { collectionSurfaceInventorySchema, collectionSurfaceSnapshotSchema, postAcceptFormSnapshotCaptureSchema,
  type PostAcceptEvidencePacket, type CollectionSurfaceSnapshot } from "@certscore/contracts";

export function verifiedPostAcceptFormSnapshots(value: unknown) {
  const parsed = postAcceptFormSnapshotCaptureSchema.safeParse(value);
  if (!parsed.success) return null;
  const capture = parsed.data;
  const inventoryHash = createHash("sha256").update(JSON.stringify(capture.inventory)).digest("hex");
  const images: Array<{ snapshot: CollectionSurfaceSnapshot; bytes: Buffer | null; capturedAtMs: number }> = [];
  const groups = [{snapshots:capture.snapshots,inventoryHash,capturedAtMs:capture.capturedAtMs},
    ...(capture.contractVersion === "certscore.post_accept_form_snapshots.v6" ? [{
      snapshots:capture.postCaptureSnapshots.snapshots,
      inventoryHash:createHash("sha256").update(JSON.stringify(capture.postCaptureInventory.inventory)).digest("hex"),
      capturedAtMs:capture.postCaptureSnapshots.capturedAtMs,
    }] : [])];
  for (const group of groups) for (const snapshot of group.snapshots) {
    if (snapshot.sourceInventoryHash !== group.inventoryHash) return null;
    if (snapshot.status !== "available") { images.push({ snapshot, bytes: null, capturedAtMs:group.capturedAtMs }); continue; }
    const bytes = Buffer.from(snapshot.data!, "base64");
    if (bytes.length !== snapshot.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== snapshot.sha256 ||
      bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    images.push({ snapshot, bytes, capturedAtMs:group.capturedAtMs });
  }
  return { capture, images };
}

/** Preserve independently valid action evidence when optional pixels fail verification. */
export function verifyPostAcceptPacketFormImages(packet: PostAcceptEvidencePacket): PostAcceptEvidencePacket {
  return !packet.formSnapshotCapture || verifiedPostAcceptFormSnapshots(packet.formSnapshotCapture)
    ? packet : { ...packet, formSnapshotCapture: undefined };
}

/** Verify retained image bytes against the exact canonical inventory before serving. */
export function verifiedFormSnapshots(raw: { collectionSurfaceInventory?: unknown; collectionSurfaceSnapshots?: unknown[] }) {
  const inventory = collectionSurfaceInventorySchema.safeParse(raw.collectionSurfaceInventory);
  if (!inventory.success) return [];
  const inventoryHash = createHash("sha256").update(JSON.stringify(inventory.data)).digest("hex");
  return (raw.collectionSurfaceSnapshots ?? []).flatMap<{ snapshot: CollectionSurfaceSnapshot; bytes: Buffer | null }>(candidate => {
    const parsed = collectionSurfaceSnapshotSchema.safeParse(candidate);
    if (!parsed.success) return [];
    const snapshot = parsed.data;
    if (snapshot.sourceInventoryHash !== inventoryHash || snapshot.pageUrl !== inventory.data.pageUrl || !inventory.data.forms.some(form => form.formRef === snapshot.formRef)) return [];
    if (snapshot.status !== "available") return [{ snapshot, bytes: null }];
    if (!snapshot.data) return [];
    const bytes = Buffer.from(snapshot.data, "base64");
    if (bytes.length !== snapshot.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== snapshot.sha256 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return [];
    return [{ snapshot, bytes }];
  });
}
