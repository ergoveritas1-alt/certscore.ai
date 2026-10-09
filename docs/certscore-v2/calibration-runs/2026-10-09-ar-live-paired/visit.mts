import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [sourceRoot, targetUrl, outDir, version, repeatText] = process.argv.slice(2);
assert.ok(sourceRoot && targetUrl && outDir);
const readModule = async (relative: string) => { const ns=await import(pathToFileURL(path.join(sourceRoot!,relative)).href); return ns.default??ns; };
const {runScan} = await readModule('packages/certscore-scan-core/src/index.ts');
const {runPostAcceptObserver} = await readModule('packages/certscore-scan-core/src/post-accept-observer.ts');
const {runPostRefusalObserver} = await readModule('packages/certscore-scan-core/src/post-refusal-observer.ts');
const acceptRegistry = await readModule('packages/certscore-scan-core/src/post-accept-cmp-recipes.ts');
const rejectRegistry = await readModule('packages/certscore-scan-core/src/post-refusal-cmp-recipes.ts');
const {assertPublicTestContactAllowed} = await readModule('packages/certscore-scan-core/src/public-test-contact-holds.ts');
const {CONSENT_CONTROL_LABEL_REGISTRY_VERSION} = await import('@certscore/contracts');
assertPublicTestContactAllowed(targetUrl,'owner-authorized live paired comparison');
process.env.CERTSCORE_HTTP_USER_AGENT='ConsentCheckBot/1.0 (+https://consentcheck.site/crawler)';
process.env.CERTSCORE_CHROMIUM_LOCALE='en-IE';
process.env.CERTSCORE_CHROMIUM_TIMEZONE_ID='Europe/Dublin';
process.env.SCAN_PROXY_ENABLED='0';
const started=Date.now(), parentId=randomUUID(), controller=new AbortController();
const lanes: any[]=[]; const handoffs: any[]=[];
await mkdir(outDir,{recursive:true});
const save=()=>writeFile(path.join(outDir!,'result.json'),JSON.stringify({version,repeat:Number(repeatText),url:targetUrl,parentId,registryVersion:CONSENT_CONTROL_LABEL_REGISTRY_VERSION,startedAt:new Date(started).toISOString(),generatedAt:new Date().toISOString(),lanes,handoffs},null,2));
async function lane(name:string, operation:(id:string,dir:string)=>Promise<any>){
 const row:any={lane:name,url:targetUrl,scanId:randomUUID(),startedAt:new Date().toISOString(),scannerRuntimeStarted:true,status:'running'};
 lanes.push(row); await save();
 try {Object.assign(row,await operation(row.scanId,path.join(outDir!,name)),{status:'completed'});}
 catch(e){Object.assign(row,{status:'failed',error:String(e)});}
 row.completedAt=new Date().toISOString(); row.durationMs=Date.parse(row.completedAt)-Date.parse(row.startedAt); await save();
}
function authorization(scanId:string){return {authorizationId:'sharded_scan_resolved_exact_target.v2',kind:'scan_target_resolution',maxRedirects:8,requestedUrl:targetUrl,resolutionTimeoutMs:5000,scanId:parentId};}
const common={url:targetUrl,normalizedUrl:targetUrl,parentScanId:parentId,scanStartedAtMs:started,actionSearchTimeoutMs:13000,confirmationTimeoutMs:2000,resultBudgetMs:30000,signal:controller.signal,productionProjectable:true};
await Promise.all([
 ...(process.env.AR_ACTIONS_ONLY==='1'?[]:[lane('consent',async(scanId,dir)=>{
  const bundle=await runScan({scanId,url:targetUrl,profile:'standard',evidenceLane:'consent_proof',outDir:dir,captureReplay:false,postConsentFlowsEnabled:false,preConsentScreenshotMode:'always',preConsentModuleDeadlineMs:30000,
    onPreConsentScreenshotCaptured:(image:any)=>handoffs.push({artifactId:image.artifactId,capturedAtMs:image.capturedAtMs,handedOffAtMs:Date.now()-started,loader:image.documentIdentity?.token,path:image.path})});
  const noGo=bundle.scanNoGoAssessment?.decision==='no_go'; if(noGo)controller.abort(new Error('passive_no_go_no_further_action'));
  let geometry:any; try{geometry=JSON.parse(await readFile(path.join(dir,'ConsentControlGeometryEvidence.json'),'utf8'));}catch{}
  return {runtime:{noGoCandidate:noGo,noGoReasons:bundle.scanNoGoAssessment?.reasonCodes??[]},moduleStatus:bundle.modulesRun[0]?.status,finalUrl:bundle.consentUiObservations[0]?.documentUrl,
    observations:bundle.consentUiObservations.map((o:any)=>({accept:o.acceptControlObserved,reject:o.rejectControlObserved,options:o.managePreferencesControlObserved,captureStatus:o.captureStatus,inventoryOutcome:o.inventoryOutcome,documentIdentity:o.documentIdentity,controls:o.controls})),
    screenshots:bundle.screenshots,domSnapshots:bundle.domSnapshots,timing:bundle.modulesRun[0]?.timingBreakdown,
    geometry:geometry?{documentIdentity:geometry.documentIdentity,pageUrl:geometry.pageUrl,screenshotArtifactRef:geometry.screenshotArtifactRef,summary:geometry.summary,candidates:geometry.candidates.map((c:any)=>({label:c.label,actionType:c.actionType,decisionStatus:c.decisionStatus,screenshotArtifactRef:c.screenshotArtifactRef,frameContext:c.frameContext}))}:null};
 })]),
 lane('accept',async(scanId,dir)=>{
  const recipes=acceptRegistry.buildCanonicalPostAcceptActionRecipes();
  const p=await runPostAcceptObserver({...common,scanId,interactionAuthorization:authorization(scanId),outDir:dir,recipe:recipes[0],recipeCandidates:recipes,recipeSetId:acceptRegistry.CANONICAL_POST_ACCEPT_RECIPE_SET_ID,allowCanonicalAcceptDiscovery:true,observationWindowMs:3000});
  return {resolver:p.resolver,registration:p.acceptanceRegistration,click:p.interactionDiagnostics?.click,actionControlProof:p.actionControlProof,afterActionCapture:p.afterActionCapture,timing:p.timing,limitations:p.limitations,navigation:p.interactionDiagnostics?.navigation};
 }),
 lane('reject',async(scanId,dir)=>{
  const recipes=rejectRegistry.buildCanonicalPostRefusalActionRecipes();
  const p=await runPostRefusalObserver({...common,scanId,interactionAuthorization:authorization(scanId),outDir:dir,recipe:recipes[0],recipeCandidates:recipes,recipeSetId:rejectRegistry.CANONICAL_POST_REFUSAL_RECIPE_SET_ID,allowCanonicalRejectDiscovery:true,observationWindowMs:8000,dispatchDelayMs:500});
  return {resolver:p.resolver,registration:p.refusalRegistration,click:p.interactionDiagnostics?.click,actionControlProof:p.actionControlProof,afterActionCapture:p.afterActionCapture,timing:p.timing,limitations:p.limitations,navigation:p.interactionDiagnostics?.navigation};
 })
]);
await save();
console.log(JSON.stringify({version,url:targetUrl,repeat:Number(repeatText),registry:CONSENT_CONTROL_LABEL_REGISTRY_VERSION,lanes:lanes.map(r=>({lane:r.lane,status:r.status,accept:r.observations?.[0]?.accept,reject:r.observations?.[0]?.reject,click:r.click?.outcome,registration:r.registration?.status,reason:r.registration?.reason}))}));
