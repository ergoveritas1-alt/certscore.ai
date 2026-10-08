import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { postAcceptEvidencePacketSchema, projectPostAcceptEvidenceForReport, projectPostAcceptFormInventory } from "@certscore/contracts";
import { verifiedPostAcceptFormSnapshots } from "../../../../server/scans/form-snapshot-evidence";
import { CollectionSurfacesTable, type CollectionSurfaceTableRow } from "../../../../components/scans/collection-surfaces-table";
export const dynamic = "force-dynamic";
export default async function SitsCaptureReview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const bytes = await readFile(path.resolve(process.cwd(), "../../artifacts/sits-local-accept-handoff-20261007/PostAcceptEvidencePacket.json"));
  const packet = postAcceptEvidencePacketSchema.parse(JSON.parse(bytes.toString()));
  const packetSha256 = createHash("sha256").update(bytes).digest("hex");
  const projection = projectPostAcceptEvidenceForReport({ packet, packetSha256 });
  const verified = verifiedPostAcceptFormSnapshots(packet.formSnapshotCapture);
  const capture = projection.formSnapshotCapture;
  const inventory = capture && projectPostAcceptFormInventory(capture);
  if (!verified || !capture || !inventory) notFound();
  // Diagnostic inventory preview only. This Accept-only run has no passive
  // control assessment and must never fabricate a scored customer report.
  const rows: CollectionSurfaceTableRow[] = inventory.forms.map(form => {
    const image = verified.images.find(image => image.snapshot.formRef === form.formRef);
    return { id: `local-accept:${form.formRef}`, form, capturedAt: image?.snapshot.capturedAt ?? "",
      capturePhase: "after_accept",
      snapshot: image?.bytes ? { status: "available", url: `/api/scans/form-handoff-local/form-snapshot?source=sits&formRef=${encodeURIComponent(form.formRef)}` }
        : { status: "unavailable", reason: image?.snapshot.reason } };
  });
  return <main className="mx-auto max-w-7xl p-4">
    <h1 className="text-xl font-semibold">SITS · fresh local After Accept capture</h1>
    <p className="my-3 text-sm text-slate-600">ConsentCheckBot · one confirmed Accept click · no forms submitted · {rows.length} forms · {inventory.forms.reduce((total, form) => total + form.fields.length, 0)} fields · {verified.images.filter(image => image.bytes).length} reviewed screenshots</p>
    <p className="mb-6 text-xs text-slate-500">Accept-only diagnostic capture · {packet.scanId} · no page score or production changes</p>
    <CollectionSurfacesTable rows={rows}/>
  </main>;
}
