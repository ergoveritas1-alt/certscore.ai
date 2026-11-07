import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp, writeFile, readFile, readdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {consentUiObservationSchema, type ScreenshotArtifact} from "@certscore/contracts";
import type {ConsentControlGeometryArtifact} from "./consent-control-geometry";
import {createFinalConsentGeometryRefresh, finalConsentGeometryRefreshReason, prepareFinalConsentGeometryArtifact, type PreparedConsentGeometry} from "./consent-final-geometry-refresh";
import retained from "./test-fixtures/retained-consent-checkpoints.json";
import aePartial from "./test-fixtures/retained-ae-partial-refresh.json";
import {reconcileConsentGeometryInventoryCoverage} from "./consent-geometry-inventory-coverage";
import {isStableConsentProofPacket} from "./scanners/pre-consent-runtime-scanner";

function setup() {
  const identity = {source: "cdp_loader_id" as const, token: "refresh-loader"};
  const state = {url: "https://fixture.test/", documentIdentity: {...identity}, frameRevision: 1, frames: [{}]};
  let clock = 2000;
  const counts = {capture: 0, prepare: 0, commit: 0, dispose: 0};
  const controller = new AbortController();
  const source = retained.find(f => f.site === "cyberghostvpn.com")!;
  const observation = consentUiObservationSchema.parse({...source.observation, documentUrl: state.url,
    documentIdentity: identity, observedAtMs: 1000});
  const geometry = (at: number): ConsentControlGeometryArtifact => ({artifactVersion: "consent_control_geometry.v1",
    sourceScanner: "consent_control_geometry_diagnostic", pageUrl: state.url, documentIdentity: {...identity},
    capturedAt: new Date(at).toISOString(), screenshotArtifactRef: "retained.png", viewport: {width: 1366, height: 900},
    cmp: {detected: false, confidence: 0, reasonCodes: [], matchedSignals: [], detections: []}, containers: [], candidates: [],
    summary: {firstLayerAccept: false, firstLayerReject: false, firstLayerOptions: false, cmpDetected: false, confidence: .9, limitations: []},
    controlInspection: {version: "control_specific_inspection.v3", structuralCoverage: "complete", retainedCandidateCount: 0,
      reasonCodes: [], candidates: [], captureCoverage: {inventoryTruncated: false, documentReadyState: "complete",
        mainFrameAvailable: true, documentAndFramesStable: true, frameCount: 1, capturedFrameCount: 1}},
  });
  const screenshot: ScreenshotArtifact = {artifactId: "retained", path: "retained.png", url: state.url,
    documentIdentity: identity, capturedAtMs: 500, captureMethod: "primary_viewport_fallback",
    pagePhase: "dom_content_loaded", consentStateAtTime: "pre_consent"};
  const prepared: PreparedConsentGeometry = {commitIfCurrent(current) {if (!current()) return undefined;counts.commit++;return "canonical.json";}, dispose() {counts.dispose++;}};
  const dependencies = {scanStartedAtMs: 0, moduleDeadlineAtMs: 10000, now: () => clock, signal: controller.signal,
    readState: () => state,
    capture: async (options: {timeoutMs: number; screenshotArtifactRef: string}) => {
      counts.capture++;assert.equal(options.timeoutMs,1100);assert.equal(options.screenshotArtifactRef,screenshot.path);clock+=100;return geometry(clock);
    },
    prepare: async (_geometry: ConsentControlGeometryArtifact) => {counts.prepare++;clock+=100;return prepared;},
  };
  return {state, counts, controller, geometry, observation, screenshot, prepared, dependencies,
    input: {observation, geometry: geometry(500), screenshot}, now: () => clock, setNow: (n: number) => {clock=n;}};
}

test("retained AE interactive multi-frame partials qualify for structural refresh without becoming complete", () => {
  for (const source of aePartial) {
    const observation = consentUiObservationSchema.parse(source.observation);
    const geometry = source.geometry as unknown as ConsentControlGeometryArtifact;
    const before = structuredClone({observation, geometry});
    assert.equal(observation.inventoryOutcome, "partial");
    assert.equal(observation.documentReadyState, "interactive");
    assert.equal(observation.boundedSameSessionRecoveryOutcome, undefined);
    assert.equal(finalConsentGeometryRefreshReason({observation, geometry, scanStartedAtMs: source.scanStartedAtMs}), "limited_geometry", source.caseId);
    assert.deepEqual({observation, geometry}, before, "Eligibility is scheduling, not a rewrite of retained evidence.");
  }
});

test("retained AE partial eligibility requires completed settled DOM and verified unresolved decisions", () => {
  const source = aePartial[1]!;
  for (const change of ["no_settled_proof", "no_semantic_marker", "no_unresolved_proof", "failed_dom", "timed_out_dom", "no_dom", "incomplete", "previous_recovery", "previous_marker", "loading", "blocking_frame", "truncated", "zero_frames_captured", "over_cap", "wrong_loader"]) {
    const observation = consentUiObservationSchema.parse(structuredClone(source.observation));
    const geometry = structuredClone(source.geometry) as unknown as ConsentControlGeometryArtifact;
    if (change === "no_settled_proof") observation.basis = observation.basis.filter(b => b !== "settled_control_inventory_completed");
    if (change === "no_semantic_marker") observation.basis = observation.basis.filter(b => b !== "unresolved_visible_consent_decision");
    if (change === "no_unresolved_proof") {geometry.candidates = []; geometry.controlInspection!.retainedCandidateCount = 0; geometry.controlInspection!.candidates = [];}
    if (change === "failed_dom") observation.captureDiagnostics!.failedChannels = ["dom_inventory"];
    if (change === "timed_out_dom") observation.captureDiagnostics!.timedOutChannels = ["dom_inventory"];
    if (change === "no_dom") observation.captureDiagnostics!.completedChannels = [];
    if (change === "incomplete") observation.captureStatus = "incomplete";
    if (change === "previous_recovery") observation.boundedSameSessionRecoveryOutcome = "geometry_incomplete";
    if (change === "previous_marker") observation.basis.push("recovery:bounded_same_session_consent_packet_geometry_incomplete");
    if (change === "loading") observation.documentReadyState = "loading";
    if (change === "blocking_frame") observation.inventoryDiagnostics!.blockingInaccessibleFrameCount = 1;
    if (change === "truncated") geometry.controlInspection!.captureCoverage!.inventoryTruncated = true;
    if (change === "zero_frames_captured") geometry.controlInspection!.captureCoverage!.capturedFrameCount = 0;
    if (change === "over_cap") geometry.controlInspection!.captureCoverage!.frameCount = 13;
    if (change === "wrong_loader") geometry.documentIdentity!.token = "other-loader";
    assert.equal(finalConsentGeometryRefreshReason({observation, geometry, scanStartedAtMs: source.scanStartedAtMs}), null, change);
  }
});

test("retained AE partial scheduling retains only complete fresh proof and never acquires a second read", async () => {
  for (const source of aePartial) for (const mode of ["complete", "missing_fresh_frame", "unstable_fresh", "changed_loader", "over_cap", "budget"]) {
    const f = setup(), start = source.scanStartedAtMs;
    f.input.observation = consentUiObservationSchema.parse(structuredClone(source.observation));
    f.input.geometry = structuredClone(source.geometry) as unknown as ConsentControlGeometryArtifact;
    f.state.url = f.input.geometry.pageUrl;
    f.state.documentIdentity = {...f.input.geometry.documentIdentity!};
    f.state.frames = Array.from({length: f.input.geometry.controlInspection!.captureCoverage!.frameCount}, () => ({}));
    f.screenshot.url = f.state.url; f.screenshot.documentIdentity = {...f.state.documentIdentity};
    f.setNow(start + 20000); f.dependencies.scanStartedAtMs = start; f.dependencies.moduleDeadlineAtMs = start + 25000;
    if (mode === "over_cap") f.state.frames = Array.from({length: 13}, () => ({}));
    if (mode === "budget") f.dependencies.moduleDeadlineAtMs = f.now() + 1499;
    f.dependencies.capture = async options => {
      assert.equal(options.timeoutMs, 1100); f.counts.capture++; f.setNow(f.now() + 100);
      const geometry = structuredClone(source.geometry) as unknown as ConsentControlGeometryArtifact;
      geometry.capturedAt = new Date(f.now()).toISOString(); geometry.screenshotArtifactRef = f.screenshot.path;
      geometry.controlInspection!.structuralCoverage = "complete";
      const coverage = geometry.controlInspection!.captureCoverage!;
      Object.assign(coverage, {documentReadyState: "complete", documentAndFramesStable: true, capturedFrameCount: f.state.frames.length});
      if (mode === "missing_fresh_frame") coverage.capturedFrameCount--;
      if (mode === "unstable_fresh") coverage.documentAndFramesStable = false;
      if (mode === "changed_loader") f.state.documentIdentity.token = "replacement-loader";
      return geometry;
    };
    const before = structuredClone(f.input), refresh = createFinalConsentGeometryRefresh(f.dependencies);
    const result = await refresh(f.input);
    assert.equal(result.outcome, mode === "complete" ? "retained" : mode === "over_cap" ? "ineligible" : mode === "budget" ? "budget_unavailable" : mode === "changed_loader" ? "document_changed" : "invalid_capture", `${source.caseId}: ${mode}`);
    assert.deepEqual(f.input, before);
    assert.equal(f.counts.capture, ["over_cap", "budget"].includes(mode) ? 0 : 1);
    assert.equal(f.counts.commit, mode === "complete" ? 1 : 0);
    assert.equal((await refresh(f.input)).outcome, "already_considered");
    assert.equal(f.counts.capture, ["over_cap", "budget"].includes(mode) ? 0 : 1);
  }
});

test("six retained stale checkpoints cannot satisfy a freshness-aware final gate; source controls stay intact", () => {
  let stale=0;
  for(const f of retained) {
    const observation=consentUiObservationSchema.parse(f.observation);
    const geometry={...f.geometry,documentIdentity:{...f.geometry.documentIdentity,source:"cdp_loader_id" as const}};
    const corrected=reconcileConsentGeometryInventoryCoverage({...f,observation,geometry});
    if(corrected===observation)continue;
    stale++;
    assert.equal(isStableConsentProofPacket({geometryArtifactWritten:true,observation,representativeScreenshotAvailable:true}),true);
    assert.equal(isStableConsentProofPacket({geometryArtifactWritten:true,observation:corrected,representativeScreenshotAvailable:true}),false);
    assert.deepEqual(corrected.controls,observation.controls);assert.equal(corrected.observedAtMs,observation.observedAtMs);
  }
  assert.equal(stale,6);
});

test("one geometry capability, one claim, no waits or other capture capabilities", async () => {
  const f=setup(),before=structuredClone(f.input),run=createFinalConsentGeometryRefresh(f.dependencies);
  const result=await run(f.input);
  assert.equal(result.outcome,"retained");assert.equal(result.elapsedMs,200);assert.equal(result.attempted,true);
  assert.equal(result.geometry?.capturedAt,new Date(2100).toISOString());
  assert.deepEqual(f.input,before);assert.deepEqual(f.counts,{capture:1,prepare:1,commit:1,dispose:1});
  assert.equal((await run(f.input)).outcome,"already_considered");assert.equal(f.counts.capture,1);
});

test("insufficient budget, cancellation, missing channels and unbound images perform zero reads", async () => {
  for(const change of ["budget","cancelled","partial","loading","no_dom","failed","image","image_loader","image_future","url","loader","fresh"]){
    const f=setup();
    if(change==="budget")f.dependencies.moduleDeadlineAtMs=f.now()+1499;
    if(change==="cancelled")f.controller.abort();
    if(change==="partial")f.observation.inventoryOutcome="partial";
    if(change==="loading")f.observation.documentReadyState="loading";
    if(change==="no_dom")f.observation.captureDiagnostics!.completedChannels=["geometry"];
    if(change==="failed")f.observation.captureDiagnostics!.failedChannels=["dom_inventory"];
    if(change==="image")f.screenshot.retentionStatus="withheld";
    if(change==="image_loader")f.screenshot.documentIdentity={source:"cdp_loader_id",token:"other"};
    if(change==="image_future")f.screenshot.capturedAtMs=99999;
    if(change==="url")f.state.url+="?changed=1";
    if(change==="loader")f.state.documentIdentity.token="other";
    if(change==="fresh")f.input.geometry=f.geometry(1000);
    const result=await createFinalConsentGeometryRefresh(f.dependencies)(f.input);
    assert.equal(result.attempted,false,change);assert.equal(f.counts.capture,0,change);assert.equal(f.counts.commit,0,change);
  }
});

test("semantic partial DOM is reusable only for a verified one-frame interactive-only structural checkpoint",async()=>{
  for(const change of ["eligible","truncated","unstable","missing_frame","multiple_frames","loading","already_complete","failed_dom"]){
    const f=setup();f.observation.inventoryOutcome="partial";
    f.input.geometry.controlInspection!.structuralCoverage="limited";
    const coverage=f.input.geometry.controlInspection!.captureCoverage!;coverage.documentReadyState="interactive";
    if(change==="truncated")coverage.inventoryTruncated=true;
    if(change==="unstable")coverage.documentAndFramesStable=false;
    if(change==="missing_frame")coverage.capturedFrameCount=0;
    if(change==="multiple_frames"){coverage.frameCount=2;coverage.capturedFrameCount=2;}
    if(change==="loading")coverage.documentReadyState="loading";
    if(change==="already_complete")coverage.documentReadyState="complete";
    if(change==="failed_dom")f.observation.captureDiagnostics!.failedChannels=["dom_inventory"];
    const result=await createFinalConsentGeometryRefresh(f.dependencies)(f.input);
    assert.equal(result.outcome,change==="eligible"?"retained":"ineligible",change);
    assert.equal(f.counts.capture,change==="eligible"?1:0,change);
    assert.equal(f.observation.inventoryOutcome,"partial","Scheduling cannot rewrite the original semantic state.");
  }
});

test("source, document and frame changes after capture prevent retention", async () => {
  for(const change of ["url","loader","revision","frame","cancelled","stale","future","limited","wrong_geometry"]){
    const f=setup(),capture=f.dependencies.capture;
    f.dependencies.capture=async options=>{const geometry=await capture(options);
      if(change==="url")f.state.url+="?changed=1";
      if(change==="loader")f.state.documentIdentity.token="different";
      if(change==="revision")f.state.frameRevision++;
      if(change==="frame")f.state.frames.push({});
      if(change==="cancelled")f.controller.abort();
      if(change==="stale")geometry.capturedAt=new Date(500).toISOString();
      if(change==="future")geometry.capturedAt=new Date(99999).toISOString();
      if(change==="limited")geometry.controlInspection!.structuralCoverage="limited";
      if(change==="wrong_geometry")geometry.documentIdentity={source:"cdp_loader_id",token:"different"};
      return geometry;};
    const result=await createFinalConsentGeometryRefresh(f.dependencies)(f.input);
    assert.equal(result.attempted,true,change);assert.notEqual(result.outcome,"retained",change);assert.equal(f.counts.prepare,0,change);assert.equal(f.counts.commit,0,change);
  }
});

test("semantic-only partial refresh requires retained marker and independently verified unresolved complete geometry",async()=>{
  for(const change of ["eligible","no_marker","resolved","limited","truncated","failed_dom","previous_recovery","previous_marker"]){
    const f=setup();f.observation.inventoryOutcome="partial";f.observation.basis.push("inventory:bounded_semantic_partial_channels");
    const c={candidateId:"unresolved",layer:"first_layer",enabled:true,intersectsViewport:true,
      boundingBox:{width:20,height:20},decisionStatus:"ambiguous",actionType:"other",label:"OK",tagName:"button",
      consentContextConfirmed:true,classifierReasonCodes:["unproven_acknowledgment_consent"]} as unknown as ConsentControlGeometryArtifact["candidates"][number];
    f.input.geometry.candidates=[c];f.input.geometry.controlInspection!.retainedCandidateCount=1;
    f.input.geometry.controlInspection!.candidates=[{candidateId:c.candidateId,role:"unknown",unresolvedIntents:["accept","reject","options","privacy_opt_out"]}];
    if(change==="no_marker")f.observation.basis=f.observation.basis.filter(b=>b!=="inventory:bounded_semantic_partial_channels");
    if(change==="resolved"){f.input.geometry.candidates=[];f.input.geometry.controlInspection!.retainedCandidateCount=0;f.input.geometry.controlInspection!.candidates=[];}
    if(change==="limited")f.input.geometry.controlInspection!.structuralCoverage="limited";
    if(change==="truncated")f.input.geometry.controlInspection!.captureCoverage!.inventoryTruncated=true;
    if(change==="failed_dom")f.observation.captureDiagnostics!.failedChannels=["dom_inventory"];
    if(change==="previous_recovery")f.observation.boundedSameSessionRecoveryOutcome="geometry_incomplete";
    if(change==="previous_marker")f.observation.basis.push("recovery:bounded_same_session_consent_packet_geometry_incomplete");
    const before=structuredClone(f.input),result=await createFinalConsentGeometryRefresh(f.dependencies)(f.input);
    assert.equal(result.outcome,change==="eligible"?"retained":"ineligible",change);
    assert.equal(f.counts.capture,change==="eligible"?1:0,change);assert.deepEqual(f.input,before);
  }
});

test("frame-limited interactive proof gets one complete fresh read, never extra frames, retries or failed DOM reuse",async()=>{
  for(const change of ["eligible","not_stale","still_limited","wrong_fresh_count","old_truncated","old_loading","dom_loading","dom_future","no_dom","failed_dom","blocking_frame","bad_old_binding","old_future","previous_recovery","current_over_cap","old_over_cap","budget"]){
    const f=setup();f.state.frames=Array.from({length:12},()=>({}));f.observation.documentReadyState="interactive";
    const coverage=f.input.geometry.controlInspection!.captureCoverage!;
    f.input.geometry.controlInspection!.structuralCoverage="limited";Object.assign(coverage,{documentReadyState:"interactive",frameCount:12,capturedFrameCount:10,documentAndFramesStable:false});
    if(change==="old_truncated")coverage.inventoryTruncated=true;
    if(change==="old_loading")coverage.documentReadyState="loading";
    if(change==="dom_loading")f.observation.documentReadyState="loading";
    if(change==="dom_future")f.observation.observedAtMs=99999;
    if(change==="not_stale")f.input.geometry.capturedAt=new Date(1500).toISOString();
    if(change==="no_dom")f.observation.captureDiagnostics!.completedChannels=["geometry"];
    if(change==="failed_dom")f.observation.captureDiagnostics!.failedChannels=["dom_inventory"];
    if(change==="blocking_frame")f.observation.inventoryDiagnostics!.blockingInaccessibleFrameCount=1;
    if(change==="bad_old_binding")f.input.geometry.documentIdentity={source:"cdp_loader_id",token:"other"};
    if(change==="old_future")f.input.geometry.capturedAt=new Date(99999).toISOString();
    if(change==="previous_recovery")f.observation.boundedSameSessionRecoveryOutcome="geometry_incomplete";
    if(change==="current_over_cap")f.state.frames.push({});
    if(change==="old_over_cap")coverage.frameCount=13;
    if(change==="budget")f.dependencies.moduleDeadlineAtMs=f.now()+1499;
    const capture=f.dependencies.capture;f.dependencies.capture=async options=>{const g=await capture(options);
      Object.assign(g.controlInspection!.captureCoverage!,{frameCount:12,capturedFrameCount:12});
      if(change==="still_limited"){g.controlInspection!.structuralCoverage="limited";g.controlInspection!.captureCoverage!.capturedFrameCount=10;}
      if(change==="wrong_fresh_count")Object.assign(g.controlInspection!.captureCoverage!,{frameCount:1,capturedFrameCount:1});
      return g;};
    if(change==="eligible")assert.equal(finalConsentGeometryRefreshReason({...f.input,scanStartedAtMs:0}),"stale_geometry");
    if(change==="not_stale")assert.equal(finalConsentGeometryRefreshReason({...f.input,scanStartedAtMs:0}),"limited_geometry");
    const result=await createFinalConsentGeometryRefresh(f.dependencies)(f.input);
    assert.equal(result.outcome,["eligible","not_stale"].includes(change)?"retained":["still_limited","wrong_fresh_count"].includes(change)?"invalid_capture":change==="budget"?"budget_unavailable":"ineligible",change);
    assert.equal(f.counts.capture,["eligible","not_stale","still_limited","wrong_fresh_count"].includes(change)?1:0,change);
    assert.equal(f.counts.commit,["eligible","not_stale"].includes(change)?1:0,change);
    assert.equal(f.observation.documentReadyState,change==="dom_loading"?"loading":"interactive","Old DOM readiness is never rewritten.");
  }
});

test("a read completing past its own cap cannot use the staging reserve; elapsed diagnostics include cleanup",async()=>{
  const late=setup();late.dependencies.capture=async()=>{late.counts.capture++;late.setNow(3101);return late.geometry(3101);};
  assert.equal((await createFinalConsentGeometryRefresh(late.dependencies)(late.input)).outcome,"timed_out");
  assert.equal(late.counts.prepare,0);
  const current=setup();current.prepared.dispose=()=>{current.counts.dispose++;current.setNow(current.now()+25);};
  const result=await createFinalConsentGeometryRefresh(current.dependencies)(current.input);
  assert.equal(result.outcome,"retained");assert.equal(result.elapsedMs,225);
});

test("late capture cannot stage or commit after its deadline", async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  const f=setup();let finish!:(g:ConsentControlGeometryArtifact)=>void;
  f.dependencies.capture=async()=>{f.counts.capture++;return await new Promise(resolve=>{finish=resolve;});};
  const pending=createFinalConsentGeometryRefresh(f.dependencies)(f.input);
  f.setNow(3100);t.mock.timers.tick(1100);
  const result=await pending;assert.equal(result.outcome,"timed_out");
  finish(f.geometry(3000));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.counts.prepare,0);assert.equal(f.counts.commit,0);
});

test("a concurrent second request cannot acquire another capture while the first is pending",async()=>{
  const f=setup();let finish!:(g:ConsentControlGeometryArtifact)=>void;
  f.dependencies.capture=async()=>{f.counts.capture++;return await new Promise(resolve=>{finish=resolve;});};
  const refresh=createFinalConsentGeometryRefresh(f.dependencies),pending=refresh(f.input);
  assert.equal((await refresh(f.input)).outcome,"already_considered");assert.equal(f.counts.capture,1);
  f.controller.abort();assert.equal((await pending).outcome,"cancelled");
  finish(f.geometry(2100));await new Promise(resolve=>setImmediate(resolve));assert.equal(f.counts.prepare,0);
});

test("late staging only disposes private output, never commits canonical evidence", async t => {
  t.mock.timers.enable({apis:["setTimeout"]});
  const f=setup();let finish!:(p:PreparedConsentGeometry)=>void;
  f.dependencies.prepare=async()=>{f.counts.prepare++;return await new Promise(resolve=>{finish=resolve;});};
  const pending=createFinalConsentGeometryRefresh(f.dependencies)(f.input);
  await new Promise(resolve=>setImmediate(resolve));
  f.setNow(3500);t.mock.timers.tick(1500);
  assert.equal((await pending).outcome,"timed_out");
  finish(f.prepared);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.counts.commit,0);assert.equal(f.counts.dispose,1);
});

test("staging rechecks cancellation, exact URL, frame revision and total elapsed time before commit", async () => {
  for(const change of ["cancelled","url","revision","deadline"]){
    const f=setup(),prepare=f.dependencies.prepare;
    f.dependencies.prepare=async geometry=>{const value=await prepare(geometry);
      if(change==="cancelled")f.controller.abort();
      if(change==="url")f.state.url+="?later=1";
      if(change==="revision")f.state.frameRevision++;
      if(change==="deadline")f.setNow(3500);
      return value;};
    const result=await createFinalConsentGeometryRefresh(f.dependencies)(f.input);
    assert.notEqual(result.outcome,"retained",change);assert.equal(f.counts.commit,0,change);assert.ok(f.counts.dispose>=1,change);
  }
});

test("atomic staging keeps the previous artifact intact until a guarded commit", async () => {
  const root=await mkdtemp(join(tmpdir(),"certscore-refresh-artifact-test-")),target=join(root,"ConsentControlGeometryEvidence.json");
  try {await writeFile(target,'{"original":true}\n');const f=setup();
    const rejected=await prepareFinalConsentGeometryArtifact(target,f.geometry(2100));
    assert.deepEqual(await readdir(root),["ConsentControlGeometryEvidence.json"]);
    assert.equal(rejected.commitIfCurrent(()=>false),undefined);rejected.dispose();
    assert.deepEqual(JSON.parse(await readFile(target,"utf8")),{original:true});
    const accepted=await prepareFinalConsentGeometryArtifact(target,f.geometry(2100));
    assert.equal(accepted.commitIfCurrent(()=>true),target);accepted.dispose();
    assert.equal(JSON.parse(await readFile(target,"utf8")).capturedAt,new Date(2100).toISOString());
  } finally {await rm(root,{recursive:true,force:true});}
});

test("reports the retained and live frame limits without attempting a read", async () => {
  const retained = setup();
  const inspection = retained.input.geometry.controlInspection!;
  inspection.structuralCoverage = "limited";
  inspection.captureCoverage.frameCount = 16;
  inspection.captureCoverage.capturedFrameCount = 12;
  const fromRetained = await createFinalConsentGeometryRefresh(retained.dependencies)(retained.input);
  assert.equal(fromRetained.eligibilityBlocker, "geometry_frame_cap_exceeded");
  assert.equal(fromRetained.attempted, false);
  assert.equal(retained.counts.capture, 0);

  const live = setup();
  live.state.frames = Array.from({length: 16}, () => ({}));
  const fromLive = await createFinalConsentGeometryRefresh(live.dependencies)(live.input);
  assert.equal(fromLive.eligibilityBlocker, "live_frame_cap_exceeded");
  assert.equal(fromLive.attempted, false);
  assert.equal(live.counts.capture, 0);
});
