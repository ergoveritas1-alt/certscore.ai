/** Local opt-in lifecycle. No production caller enables this protocol. The
 * original capture API/output and its wait policy remain unchanged. */
import {retainGpcComparisonLedger} from "./gpc-comparison-ledger";
import {createHash} from "node:crypto";
import {createGpcImpactCapture} from "./gpc-impact-capture";
import {gpcImpactCaptureSchema, gpcNavigationRecoverySchema, type GpcImpactCapture, type GpcNavigationRecovery, type CanonicalEvidenceBundle} from "@certscore/contracts";
import type {GpcSignalObservation} from "@certscore/contracts";

type Capture = ReturnType<typeof createGpcImpactCapture>;
type Requested = Parameters<Capture['documentRequested']>[0];
type Committed = Parameters<Capture['documentCommitted']>[0];
type Within = Parameters<Capture['navigatedWithinDocument']>[0];
type Request = Parameters<Capture['recordRequest']>[0];
const PROTOCOL = 'certscore.local-final-document-recovery.v1' as const;
// Compaction may add a separately verified ledger or flag missing detail; neither
// changes the original producer's document, counts, digests or invalidations.
export function originalGpcCaptureHash(capture: GpcImpactCapture): string {
 const {requestLedger: _ledger, retentionStatus: _status, ...original} = gpcImpactCaptureSchema.parse(capture);
 return createHash("sha256").update(JSON.stringify(original)).digest("hex");
}

export function createGpcNavigationRecovery(input:Parameters<typeof createGpcImpactCapture>[0] & {deadlineMs:number}) {
 if(!Number.isSafeInteger(input.deadlineMs)||input.deadlineMs<input.now())throw Error('Existing capture deadline required');
 const original=createGpcImpactCapture(input);
 let candidate:Capture|undefined, committed=false, candidateCommitted=false, closed=false, stopped=false;
 let attemptCount=0;
 let candidateFreezeAtMs:number|undefined;
 const reasons=new Set<string>();
 if(input.adaptive){reasons.add('adaptive_recovery_not_supported');stopped=true;}
 let result:ReturnType<typeof finish>|undefined;
 // One fresh capture at the first main-document request after a commit.
 // Redirect hops before its commit belong to that one attempt; another
 // post-commit navigation exhausts it. No new browser call, wait or budget.
 function stop(reason:string){reasons.add(reason);stopped=true;candidate?.invalidate();}
 function eligibleNow(){if(input.now()>=input.deadlineMs){stop('existing_budget_exhausted');return false;}return !stopped;}
 function documentRequested(p:Requested,mainFrameId:string){
  if(closed)return;
  original.documentRequested(p,mainFrameId);
  if(p.type!=='Document'||p.frameId!==mainFrameId)return;
  if(!p.loaderId||!p.request?.url||!/^https?:/.test(p.request.url)){if(committed)stop('navigation_identity_unverified');return;}
  if(!committed)return;
  if(!eligibleNow())return;
  if(candidateCommitted){stop('repeated_navigation');return;}
  if(!candidate){candidate=createGpcImpactCapture({...input,now:()=>candidateFreezeAtMs??input.now()});attemptCount++;}
  candidate.documentRequested(p,mainFrameId);
 }
 function documentCommitted(frame:Committed, observedAtMs?:number){
  if(closed)return;
  const committedAtMs=observedAtMs??input.now();
  original.documentCommitted(frame,committedAtMs);
  if(frame.parentId)return;
  if(!frame.loaderId||!frame.url||!/^https?:/.test(frame.url)){stop('commit_identity_unverified');return;}
  committed=true;
  if(candidate&&eligibleNow()){
   if(candidateCommitted){stop('repeated_commit');return;}
   candidate.documentCommitted(frame,committedAtMs);candidateCommitted=true;
  }
 }
 function navigatedWithinDocument(event:Within,token:string|undefined){
  if(closed)return;
  original.navigatedWithinDocument(event,token);
  // A same-document route change is not a new document/commit and cannot
  // start recovery. If a candidate exists, its unchanged legacy guard applies.
  if(candidate&&eligibleNow())candidate.navigatedWithinDocument(event,token);
 }
 function recordRequest(event:Request){if(closed)return;original.recordRequest(event);if(candidate&&eligibleNow())candidate.recordRequest(event);}
 function bindReadback(...binding:Parameters<Capture['bindReadback']>){if(closed)return;original.bindReadback(...binding);if(candidate&&eligibleNow())candidate.bindReadback(...binding);}
 function invalidate(reason:Parameters<Capture['invalidate']>[0]){if(closed)return;original.invalidate(reason);stop('capture_invalidated');}
 function finish(proof?:GpcSignalObservation):{originalCapture:GpcImpactCapture;recovery:GpcNavigationRecovery}{
  if(result)return result;
  // Freeze with the existing final readback only; no extra readback or extension.
  if(candidate&&input.now()>input.deadlineMs)stop('existing_budget_exhausted');
  closed=true;
  const originalCapture=original.finish(proof);
  // Freeze the secondary packet at the original checkpoint. Sequential wall
  // clock reads can cross a millisecond or deadline; they are not two visits.
  candidateFreezeAtMs=originalCapture.capturedAtMs;
  if(candidate&&candidateFreezeAtMs>input.deadlineMs)stop('existing_budget_exhausted');
  const finalDocumentCapture=candidate?.finish(proof)??null;
  const available=Boolean(finalDocumentCapture?.windows.length&&!stopped);
  result={originalCapture,recovery:gpcNavigationRecoverySchema.parse({contractVersion:PROTOCOL,mode:'local_experiment',productionProjectable:false,scoreEffect:'none',
   deadlineMs:input.deadlineMs,attemptCount,originalCaptureSha256:originalGpcCaptureHash(originalCapture),finalDocumentCapture,
   status:available?'candidate_available':candidate?'candidate_unavailable':'not_attempted',limitationKeys:[...new Set([...reasons,...(finalDocumentCapture?.limitationKeys??[])])]})};
  return result;
 }
 return {documentRequested,documentCommitted,navigatedWithinDocument,recordRequest,bindReadback,invalidate,
   // Preserve the original wait: recovery never extends a visit or restarts adaptive waiting.
   remainingObservationMs: original.remainingObservationMs, waitForAdaptive: original.waitForAdaptive,
   finish: (proof?:GpcSignalObservation) => finish(proof).originalCapture,
   finishRecovery: (proof?:GpcSignalObservation) => finish(proof).recovery};
}


/** Reuse the already captured, full request array with an independent candidate
 * digest and the existing 64 KiB compact-ledger cap. No raw URLs are added. */
export function retainGpcRecoveryLedger(bundle:CanonicalEvidenceBundle):GpcNavigationRecovery|undefined {
 const recovery=bundle.gpcNavigationRecovery;
 if(!recovery?.finalDocumentCapture)return recovery;
 return gpcNavigationRecoverySchema.parse({...recovery,finalDocumentCapture:retainGpcComparisonLedger({...bundle,gpcImpactCapture:recovery.finalDocumentCapture})});
}

/** Verified-source selection for an explicitly requested new protocol only.
 * Never serialize this derived view as the original source bundle. */
export function selectGpcRecoveryCapture(bundle:CanonicalEvidenceBundle):GpcImpactCapture|undefined {
 const original=bundle.gpcImpactCapture,recovery=bundle.gpcNavigationRecovery;
 if(!original||!recovery||recovery.originalCaptureSha256!==originalGpcCaptureHash(original)||recovery.limitationKeys.length||
   original.adaptiveObservation||original.localRetention)return undefined;
 const selected=recovery.status==='candidate_available'?recovery.finalDocumentCapture:
   recovery.status==='not_attempted'&&original.capturedAtMs<=recovery.deadlineMs?original:null;
 if(selected && (selected.expectedEnabled!==original.expectedEnabled || selected.captureStartedAtMs<original.captureStartedAtMs ||
   selected.capturedAtMs!==original.capturedAtMs || selected.document?.token!==original.document?.token ||
   selected.document?.urlSha256!==original.document?.urlSha256 || selected.document?.committedAtMs!==original.document?.committedAtMs))return undefined;
 const signalBinding=bundle.gpcSignalObservation?.prototypeCaptureBinding;
 if(signalBinding&&signalBinding.documentToken!==selected?.document?.token)return undefined;
 return selected??undefined;
}
