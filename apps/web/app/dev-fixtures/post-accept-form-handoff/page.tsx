import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { postAcceptEvidencePacketSchema, projectPostAcceptEvidenceForReport } from "@certscore/contracts";
import { projectPostAcceptForms } from "../../../lib/scans/post-accept-form-projection";
import { observedControlAssessment } from "../../../lib/scans/test-fixtures/observed-control-assessment";
import { CollectionSurfacesTable } from "../../../components/scans/collection-surfaces-table";
import { ReportInventorySummary } from "../../../components/scans/report-inventory-summary";
export const dynamic="force-dynamic";
export default async function Review(){
  if(process.env.NODE_ENV!=="development")notFound();
  const bytes=await readFile(path.resolve(process.cwd(),'../../artifacts/post-accept-form-handoff-local/PostAcceptEvidencePacket.json'));
  const packet=postAcceptEvidencePacketSchema.parse(JSON.parse(bytes.toString()));
  const projection=projectPostAcceptEvidenceForReport({packet,packetSha256:createHash('sha256').update(bytes).digest('hex')});
  const assessment={...observedControlAssessment,scan:{...observedControlAssessment.scan,scanId:packet.scanId}};
  const forms=projectPostAcceptForms({consentControlAssessment:assessment,postAcceptEvidenceProjection:projection});
  const rows=forms.rows.map(row=>row.snapshot.status==='available'?{...row,snapshot:{...row.snapshot,
    url:`/api/scans/form-handoff-local/form-snapshot?formRef=${encodeURIComponent(row.form.formRef)}`}}:row);
  return <main className="mx-auto max-w-7xl p-4"><h1 className="text-xl font-semibold">Local post-Accept capture verification</h1>
    <p className="my-3 text-sm text-slate-600">Loopback fixture · delayed inventory response · late Contact and Newsletter forms</p>
    <ReportInventorySummary metrics={[]} formCount={0} forms={rows}/>
    <div className="mt-6"><CollectionSurfacesTable rows={rows}/></div>
    <h2 className="mt-8 mb-3 font-semibold">Incomplete empty capture</h2>
    <ReportInventorySummary metrics={[]} formCount={0} formCountStatus="not_captured"/>
  </main>;
}
