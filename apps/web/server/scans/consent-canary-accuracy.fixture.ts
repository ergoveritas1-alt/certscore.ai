import type { CanonicalEvidenceBundle } from "@certscore/contracts";

// Minimal, fictionalized packets for the seven individually replayed retained
// visits. No screenshots, raw page bodies, cookie values or runtime requests.
export const consentCanaryVisits = [
  {sourceScanId:"66340fa3-4cf8-4073-9b8a-7eefeea27cd7",kind:"stress",observedAtMs:11293},
  {sourceScanId:"f94faba4-22c5-495c-a5a3-71464c3c4e03",kind:"rtl",observedAtMs:12136},
  {sourceScanId:"20c74c44-4ee8-4b01-bc98-93761717c836",kind:"stress",observedAtMs:12190},
  {sourceScanId:"7c8b2586-5ae3-41ad-ac65-d89f3da1bf75",kind:"rtl",observedAtMs:11900},
  {sourceScanId:"eb7e4a9e-0f92-401d-ae3a-6fac2fc90ba5",kind:"stress",observedAtMs:11700},
  {sourceScanId:"5bef33f0-6af2-4f54-9465-919544754317",kind:"baseline",observedAtMs:11000},
  {sourceScanId:"51fd6d85-6c45-433a-89b2-32d0f66f7739",kind:"baseline",observedAtMs:10817},
] as const;

export function consentCanaryAccuracyFixture(index: number) {
  const visit=consentCanaryVisits[index]!;
  const baseline=visit.kind==="baseline";
  const scanId=`10000000-0000-4000-8000-00000000000${index}`;
  const url=`https://consent-fixture.test/${visit.kind}.html`;
  const startedAt="2026-10-19T10:00:00.000Z";
  const documentIdentity={source:"cdp_loader_id" as const,token:`fixture-loader-${index}`};
  const labels=visit.kind==="rtl"?[["السماح بالكل","accept_all"]]:[
    ["Accept all","accept_all"],[baseline?"Manage preferences":"Manage choices","manage_preferences"],
  ];
  const candidates=labels.map(([label,actionType],i)=>({candidateId:`candidate_${i}`,label,actionType,tagName:"button",
    layer:"first_layer",presentationType:"dedicated_button",enabled:true,intersectsViewport:true,boundingBox:{width:120,height:40},
    decisionStatus:"confirmed_visible",consentContextConfirmed:baseline,
    classifierReasonCodes:[`matched_${i?"options":"accept"}`],
    diagnosticClassifications:[{classifierProfile:"multilingual_v1",productionCredit:false}],
  }));
  const controls=baseline?[
    {label:"Accept all",actionType:"accept_all",tagName:"button",visible:true,layer:"first_layer"},
    {label:"Manage preferences",actionType:"manage_preferences",tagName:"button",visible:true,layer:"first_layer"},
    {label:"Privacy choices",actionType:"do_not_sell_share",tagName:"h1",visible:true,layer:"first_layer",consentContextEvidence:"local_surface"},
  ]:[];
  const geometry={artifactVersion:"2.0",pageUrl:url,documentIdentity,observedAtMs:visit.observedAtMs,
    capturedAt:new Date(Date.parse(startedAt)+visit.observedAtMs).toISOString(),access:{status:"loaded",httpStatus:200},
    summary:{firstLayerAccept:true,firstLayerReject:false,firstLayerOptions:visit.kind!=="rtl",cmpDetected:false,confidence:0.79,limitations:[]},
    candidates,containers:[],controlInspection:{version:"control_specific_inspection.v3",retainedCandidateCount:candidates.length,
      structuralCoverage:"complete",reasonCodes:[],captureCoverage:{inventoryTruncated:false,documentReadyState:"complete",mainFrameAvailable:true,documentAndFramesStable:true,frameCount:1,capturedFrameCount:1},
      candidates:baseline?candidates.map(row=>({candidateId:row.candidateId,role:"decision",unresolvedIntents:[]})):[]},
  };
  const bundle={schemaVersion:"certscore.v2.canonical-evidence-bundle.v1",scanId,url,normalizedUrl:url,startedAt,completedAt:"2026-10-19T10:00:20.000Z",
    domSnapshots:[{artifactId:"dom",capturedAtMs:visit.observedAtMs,url,documentIdentity,consentStateAtTime:"pre_consent",
      textExcerpt:baseline?"We use cookies for optional analytics and advertising. Choose your cookie preferences. Accept all. Manage preferences.":
        "Intentional accessibility test controls and multilingual interface samples. These diagnostic elements submit no data and provide no account actions."}],
    consentUiObservations:[{observationId:"consent_ui_pre_consent",observedAtMs:visit.observedAtMs,documentUrl:url,documentIdentity,
      documentReadyState:"complete",captureStatus:baseline?"observed":"no_evidence",inventoryOutcome:baseline?"complete_with_controls":"complete_empty",
      likelyPresent:baseline,layerInspected:"first_layer",controls,basis:["settled_control_inventory_completed"],evidenceRefs:[],
      captureDiagnostics:{completedChannels:["dom_inventory","geometry","accessibility_tree"],timedOutChannels:[],failedChannels:[]}}],
    runtimeCoverage:{coverageStatus:"usable",limitationKeys:[],fallbackModesUsed:[],notes:[],silentEmpty:false,
      observationCounts:{networkEvents:0,thirdPartyRequests:0,cookieEvents:0,cookiesBeforeConsent:0,normalizedVendors:0,observedJourneys:0}},
    transportSecurityObservations:[{finalUrl:url}],policySurfaceObservations:[],networkEvents:[],cookieEvents:[],iframeEvents:[],
    modulesRun:[{moduleName:"preConsentRuntimeScanner",status:"completed",startedAt,completedAt:"2026-10-19T10:00:20.000Z",durationMs:20000,errors:[],evidenceRefs:[]}],
    screenshots:[],runtimeTimeline:[],
  } as unknown as CanonicalEvidenceBundle;
  return {visit,baseline,scanId,url,bundle,geometry};
}

/** These packets are fictional consent-only shapes. Publication fixtures also
 * need an explicitly fictional, independent original runtime visit. */
export function withOriginalRuntimeForPublication(bundle: import("@certscore/contracts").CanonicalEvidenceBundle) {
  const document = bundle.domSnapshots.at(-1)!;
  bundle.policySurfaceInspection = { ...bundle.policySurfaceInspection, californiaReviewPolicy: "california-privacy-review.v10" } as import("@certscore/contracts").CanonicalEvidenceBundle["policySurfaceInspection"];
  bundle.runtimeMetadataSnapshots = [{ ...document, artifactId: "fixture-runtime-dom", path: "/fixture/runtime.txt",
    documentIdentity: {source:"cdp_loader_id",token:"fixture-runtime-loader"},
    siteMetadata: {contractVersion:"certscore.site-metadata.v1",title:"Fictional publication fixture",language:"en",generators:[],wordpressAssetObserved:false} }];
  bundle.scanLaneRuns = [{laneId:"runtime_evidence",physicalInvocationId:"fixture-runtime",region:"local",phaseName:"preConsentRuntimeScanner",
    startedAt:bundle.startedAt,completedAt:bundle.completedAt,durationMs:Date.parse(bundle.completedAt)-Date.parse(bundle.startedAt),
    firstResponseAt:bundle.startedAt,firstResponseOffsetMs:0,firstHttpStatus:200,firstEffectiveUrl:document.url,navigationCount:1,
    navigationAttempts:[{sequence:1,mode:"initial_https_navigation",outcome:"success",httpStatus:200,durationMs:10,effectiveUrl:document.url}],
    challengeDetected:false,challengeType:null,executionOutcome:"success",accessOutcome:"representative_page"}];
}
