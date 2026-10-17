import {notFound} from "next/navigation";
import {headers} from "next/headers";
import {deriveConsentControlAssessment} from "@certscore/contracts";
import {californiaCoverageFixture,CA_FIXTURE_POLICY,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from "../../../server/scans/california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "../../../server/scans/california-privacy-review-projection";
import {buildUnifiedFindingDisplayPackets} from "../../../lib/scans/unified-findings";
import {deriveCaliforniaRegulatoryScore} from "../../../lib/scans/california-regulatory-score";
import {projectCaliforniaRegulatoryPriorities} from "../../../lib/scans/california-regulatory-priorities";
import {FullSiteExecutiveSummary} from "../../../components/scans/full-site-executive-summary";
import {SitePriorityReview} from "../../../components/scans/site-priority-review";

export const dynamic="force-dynamic";
export default async function CaliforniaScorePreview({searchParams}:{searchParams:Promise<{scenario?:string}>}) {
  if(process.env.NODE_ENV!=="development" || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test((await headers()).get("host")??""))notFound();
  const {scenario="complete"}=await searchParams;
  const f=californiaCoverageFixture(scenario==="limited" ? "Canadian Privacy Policy. You may access and correct your information. Contact privacy@example.test. We use Google Analytics." :
    scenario==="unresolved" ? CA_FIXTURE_POLICY.replace("We do not sell or share personal information.","We may share personal information for cross-context behavioral advertising.") : CA_FIXTURE_POLICY);
  if(scenario==="broken") {
    f.bundle.policySurfaceInspection!.privacyChoiceInspection!.namedChoiceCandidateCount=1;
    f.bundle.policySurfaceObservations.push({...f.bundle.policySurfaceObservations[0]!,observationId:"choice",surfaceType:"do_not_sell_or_share",
      url:`${CA_FIXTURE_URL}choices`,normalizedUrl:`${CA_FIXTURE_URL}choices`,finalUrl:`${CA_FIXTURE_URL}choices`,
      linkText:"Do Not Sell or Share My Personal Information",classifierProvenance:"privacy_surface_classifier.v1",status:"failed",documentFetchState:"failed",fetchFailureReason:"http_error",httpStatus:404});
  }
  const child=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=child;
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
  const score=deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:[],unifiedFindings:packets});
  const findings=projectCaliforniaRegulatoryPriorities(packets).map((finding,index)=>({...finding,rank:index+1,pages:[{id:"homepage",url:CA_FIXTURE_URL,homepage:true}]}));
  return <main className="mx-auto max-w-6xl px-6 py-8 text-zinc-900">
    <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">Local report preview · deterministic fixture · production unchanged</p>
    <h1 className="mt-2 text-3xl font-semibold">California score and coverage</h1>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">These examples pass through the typed assessment, concern policy and unified findings used by reports. They illustrate the revised policy; they are not findings from Vianet or another live website.</p>
    <nav className="my-6 flex flex-wrap gap-3" aria-label="California scoring scenarios">{[["complete","Complete evidence"],["limited","Insufficient policy evidence"],["unresolved","Sale/sharing choice needs review"],["broken","Verified broken choice"]].map(([id,label])=><a key={id} aria-current={scenario===id?"page":undefined} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm aria-[current=page]:border-sky-700 aria-[current=page]:bg-sky-50" href={`?scenario=${id}`}>{label}</a>)}</nav>
    <FullSiteExecutiveSummary reviewFocus="ccpa_cpra" californiaScore={score} pending={false} scannedPages={1} score={{value:73,scoredPages:1,priorityReview:findings}} />
    <SitePriorityReview findings={findings} californiaAssessment={child} reviewFocus="ccpa_cpra" pending={false} sitewideAvailable scannedPages={1} />
    <section className="mt-8 rounded-xl border border-zinc-200 p-5"><h2 className="font-semibold">Score attribution</h2>
      <p className="mt-2 text-sm">Policy: {score.policyVersion} · {score.coverage} coverage · {score.score===null?"No numeric score":`${score.score}/100`}</p>
      {score.deductions.length ? <ul className="mt-3 text-sm">{score.deductions.map(row=><li key={row.policyKey}>{row.label}: −{row.points}</li>)}</ul> : <p className="mt-3 text-sm">No supported deductions. Missing named choice alone deducts zero.</p>}
    </section>
    <p className="mt-6 text-sm"><a className="text-sky-700 underline" href="https://certscore.ai/scan/0b4a8b60-f39e-47a9-a274-a8860a5d925b" target="_blank" rel="noreferrer">Original Vianet scan</a> retains its historical score and evidence. A fresh production report will use this policy after an approved release.</p>
  </main>;
}
