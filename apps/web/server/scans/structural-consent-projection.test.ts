import assert from "node:assert/strict";
import test from "node:test";
import {mkdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {chromium,type Browser} from "playwright";
import {canonicalEvidenceBundleSchema,consentControlAssessmentSchema} from "@certscore/contracts";
import {readinessFixture} from "../../../../packages/certscore-scan-core/src/test-fixtures/structural-browser";
import {createFinalConsentGeometryRefresh,prepareFinalConsentGeometryArtifact} from "../../../../packages/certscore-scan-core/src/consent-final-geometry-refresh";
import {finalizeBoundedSameSessionConsentPacket} from "../../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner";
import {deriveMaterializedConsentControlAssessment} from "./consent-control-assessment-projector";
import {projectPublicFirstLayerConsentEvidence} from "../../lib/scans/public-first-layer-consent-evidence";
import {captureConsentControlGeometry} from "../../../../packages/certscore-scan-core/src/consent-control-geometry";

let browser:Browser;const results:unknown[]=[];
test.before(async()=>{browser=await chromium.launch({headless:true});});
test.after(async()=>{await browser?.close();if(process.env.CERTSCORE_STRUCTURAL_OUT){await mkdir(process.env.CERTSCORE_STRUCTURAL_OUT,{recursive:true});await writeFile(join(process.env.CERTSCORE_STRUCTURAL_OUT,"structural-projection-results.json"),JSON.stringify({scope:"Owned readiness fixtures, not original reports or public scans",results},null,2)+"\n",{flag:"wx"});}});
for(const site of ["ab.pl","portaldecompraspublicas.com.br"] as const)test(`${site}: fresh structural proof preserves control-specific unknowns through canonical public projection`,async()=>{
 const f=await readinessFixture(browser,site);try{
  const project=(observation:typeof f.stale,geometry:typeof f.old)=>{
   const bundle=canonicalEvidenceBundleSchema.parse({scanId:`structural-${site}`,url:f.url,normalizedUrl:f.url,startedAt:new Date(f.started).toISOString(),completedAt:new Date().toISOString(),
    scanProfile:{profileId:"consent",label:"CertScore.ai structural readiness fixture",targetDurationMs:1500,internalBudgetMs:1500,enabledModules:[]},
    modulesRun:[],runtimeTimeline:[],networkEvents:[],cookieEvents:[],cookieSnapshots:[],storageSnapshots:[],scriptEvents:[],iframeEvents:[],consentUiObservations:[observation],
    screenshots:[f.image],normalizedVendorObservations:[],derivedRuntimeSignals:{},artifactRefs:[],scannerVersion:"owned-fixture",schemaVersion:"2.0",
    domSnapshots:[{artifactId:"fixture-dom",capturedAtMs:f.stale.observedAtMs,documentIdentity:f.identity,path:"fixture-dom.html",url:f.url,consentStateAtTime:"pre_consent",pagePhase:"dom_content_loaded"}],
   });
   const assessment=consentControlAssessmentSchema.parse(deriveMaterializedConsentControlAssessment({bundle,consentControlGeometryEvidence:geometry as unknown as Record<string,unknown>,finalUrl:f.url,noGo:false}));
   return {assessment,publicEvidence:projectPublicFirstLayerConsentEvidence(assessment,bundle.scanId)};
  };
  const before=project(f.stale,f.old);assert.equal(before.assessment.controls.reject.state,"unknown");
  const refresh=createFinalConsentGeometryRefresh({scanStartedAtMs:f.started,moduleDeadlineAtMs:Date.now()+3000,
   readState:()=>({url:f.page.url(),documentIdentity:f.identity,frameRevision:0,frames:f.page.frames()}),
   capture:options=>captureConsentControlGeometry(f.page,options),prepare:geometry=>prepareFinalConsentGeometryArtifact(f.path,geometry)});
  const result=await refresh({observation:f.stale,geometry:f.old,screenshot:f.image});assert.equal(result.outcome,"retained");
  const observation=finalizeBoundedSameSessionConsentPacket({current:f.stale,recoveryInventory:f.stale,geometry:result.geometry!,artifactPath:result.artifactPath!,pageUrl:f.url,scanStartedAtMs:f.started});
  const after=project(observation,result.geometry!);
  assert.notEqual(after.assessment.controls.reject.state,"observed");
  assert.equal(after.assessment.controls.options.state,"unknown");assert.equal(after.publicEvidence?.managePreferencesControlObserved,null);
  assert.equal(after.assessment.controls.accept.state,"observed");assert.equal(after.publicEvidence?.acceptControlObserved,true);
  if(site==="ab.pl"){
   assert.equal(after.assessment.controls.reject.state,"not_observed");assert.equal(after.publicEvidence?.rejectControlObserved,false);
   assert.equal(after.assessment.controls.reject.inspection?.status,"complete");
  }else{
   assert.equal(after.assessment.controls.reject.state,"unknown");assert.equal(after.publicEvidence?.rejectControlObserved,null);
  }
  results.push({site,sourceGeometrySha256:f.source.source.sha256,oldCoverage:f.old.controlInspection?.captureCoverage,freshCoverage:result.geometry!.controlInspection?.captureCoverage,
   before:{reject:before.assessment.controls.reject.state,options:before.assessment.controls.options.state},after:{reject:after.assessment.controls.reject.state,options:after.assessment.controls.options.state},
   publicEvidence:after.publicEvidence,assessment:after.assessment,elapsedMs:result.elapsedMs});
 }finally{await f.close();}
});
