import {notFound} from "next/navigation";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {consentControlAssessmentSchema,postAcceptReportProjectionSchema} from "@certscore/contracts";
import {projectRetainedActionTimeline} from "../../../lib/scans/action-timeline-projection";
import {ReportPageEventTimeline} from "../../../components/scans/report-page-event-timeline";
export const dynamic="force-dynamic";
export default async function Review(){
  if(process.env.NODE_ENV!=="development")notFound();
  const retained=JSON.parse(await readFile(path.resolve(process.cwd(),"../../artifacts/missing-accept-timeline-20261008/LocalTimelineReview.json"),"utf8"));
  const assessment=consentControlAssessmentSchema.parse(retained.assessment);
  const projection=postAcceptReportProjectionSchema.parse(retained.projection);
  const accept=projectRetainedActionTimeline(projection,assessment,"accept");
  if(!accept)notFound();
  return <main className="mx-auto max-w-7xl p-6"><h1 className="mb-2 text-xl font-semibold">SITS · retained Accept timeline review</h1>
    <p className="mb-6 text-sm text-slate-500">Scan e0fdabad-90e2-4688-8da7-49f83adc39b6 · verified retained evidence · local preview</p>
    <ReportPageEventTimeline events={[]} accept={accept}/>
  </main>;
}
