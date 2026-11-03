import test from "node:test";
import assert from "node:assert/strict";
import { gpcProductFixture } from "./test-fixtures/gpc-product";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { buildCanonicalGpcResponseProjection } from "./gpc-response-projection";
import { buildGpcGuidance } from "./gpc-guidance";
import { gpcResponseAssessmentSchema, describeGpcGuidance } from "@certscore/contracts";
import { QUALIFIED_URL, ANALYTICS_URL, UNRESOLVED_AD_URL } from "./test-fixtures/california-priority-gpc";

const findings = (assessment: ReturnType<typeof gpcProductFixture>['assessment']) => buildUnifiedFindingDisplayPackets({runtimeArtifacts:{gpcResponseAssessment:assessment},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});

test("unavailable GPP guidance names only the bound terminal interface fact and preserves independent comparison limits",()=>{
  const {assessment}=gpcProductFixture({apiUnavailable:true,baselineReadbackIncomplete:true});
  const legacy=structuredClone(assessment);delete legacy.observation.semanticReadiness;
  const packets=findings(assessment),without=findings(legacy);
  const effects=(rows:typeof packets)=>rows.map(f=>({id:f.unifiedFindingId,status:f.presentationDecision.status,severity:f.severity,score:f.scoreEffects,top:f.topFindingEligibility}));
  assert.deepEqual(effects(packets),effects(without));
  const guidance=buildGpcGuidance(assessment,packets)!,text=describeGpcGuidance(guidance).join(" ");
  assert.equal(guidance.items.length,1);assert.equal(guidance.items[0]!.kind,"neutral");
  assert.match(text,/supported GPP API was not callable in the main document at the terminal checkpoint/);
  assert.match(text,/CMP identification is separate evidence/);assert.match(text,/Observed \+\d+ ms/);
  assert.match(text,/full-context GPC-off browser readback was not verified/);
  assert.doesNotMatch(text,/install GPP|failed to honor|not honoring|not configured|permanently|documentToken|fixture-loader|deduct/i);
  const oldText=describeGpcGuidance(buildGpcGuidance(legacy,without)!).join(" ");
  assert.match(oldText,/specific interface-availability reason was not retained/);assert.doesNotMatch(oldText,/API was not callable/);
  const all=structuredClone(assessment);
  all.comparison.limitationKeys=["baseline_signal_readback_unverified","gpc_signal_readback_unverified","baseline_gpc_off_not_verified",
    "paired_scan_context_mismatch","baseline_not_representative","baseline_settle_not_completed","unreviewed=https://private.test/?token=secret"];
  const bounded=buildGpcGuidance(all,[])!;assert.ok(bounded.items[0]!.whatToCheck.every(s=>s.length<=600));
  assert.match(describeGpcGuidance(bounded).join(" "),/additional paired prerequisites/);
  assert.doesNotMatch(describeGpcGuidance(bounded).join(" "),/private.test|secret|token=/);
});

test("not-ready guidance explains only retained readiness and independent paired proof limitations", () => {
  for(const notReady of ["synchronous_ping_unavailable","cmp_status_not_loaded","signal_status_not_ready","both"] as const) {
    const f=gpcProductFixture({notReady,baselineReadbackIncomplete:true});
    assert.equal(f.cmpStateComparison,undefined);
    const packets=findings(f.assessment), projection=buildCanonicalGpcResponseProjection(packets)!;
    assert.equal(projection.assessment.contractVersion,"certscore.gpc-response-assessment.v3");
    assert.equal(projection.guidance?.items.length,1);
    const text=describeGpcGuidance(projection.guidance!).join(" ");
    assert.match(text,notReady==="synchronous_ping_unavailable"?/successful synchronous callback/:/ping reported/);
    assert.match(text,/full-context GPC-off browser readback was not verified/);
    assert.match(text,/No baseline setting or unchanged state is inferred/);
    assert.doesNotMatch(text,/failed to honor|not honoring|install GPP|caused by|documentToken|fixture-loader|deduct/i);
    const without=structuredClone(f.assessment); delete without.observation.semanticReadiness;
    const effects=(rows:typeof packets)=>rows.map(f=>({id:f.unifiedFindingId,severity:f.severity,status:f.presentationDecision.status,score:f.scoreEffects}));
    assert.deepEqual(effects(packets),effects(findings(without)));
    assert.match(describeGpcGuidance(buildGpcGuidance(without,findings(without))!).join(" "),/specific readiness reason was not retained/);
  }
  const f=gpcProductFixture(), packets=buildUnifiedFindingDisplayPackets({runtimeArtifacts:{gpcResponseAssessment:f.assessment,gpcCmpStateComparison:f.cmpStateComparison},reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
  assert.doesNotMatch(describeGpcGuidance(buildCanonicalGpcResponseProjection(packets)!.guidance!).join(" "),/settings comparison is unavailable/);
});

test("readiness metadata cannot change an independently qualifying collection finding or its effect",()=>{
  const {assessment}=gpcProductFixture({notReady:"signal_status_not_ready",urls:[QUALIFIED_URL]});
  const present=findings(assessment), legacy=structuredClone(assessment);delete legacy.observation.semanticReadiness;
  const absent=findings(legacy);
  const effects=(rows:typeof present)=>rows.map(f=>({id:f.unifiedFindingId,severity:f.severity,status:f.presentationDecision.status,
    score:f.scoreEffects,categories:f.categoryAlignments,topFindingEligibility:f.topFindingEligibility,details:f.details?.family}));
  assert.deepEqual(effects(present),effects(absent));
  assert.ok(buildGpcGuidance(assessment,present)!.items.some(i=>i.code==="qualified_collection_under_gpc"));
  const adverse=(a:typeof assessment,f:typeof present)=>buildGpcGuidance(a,f)!.items.filter(i=>i.kind==="adverse");
  assert.deepEqual(adverse(assessment,present),adverse(legacy,absent));
});

test("canonical contradiction and collection coexist with distinct evidence-owned guidance", () => {
  const {assessment} = gpcProductFixture({contradiction:true,urls:[QUALIFIED_URL]});
  const packets = findings(assessment), guidance = buildCanonicalGpcResponseProjection(packets)?.guidance;
  assert.deepEqual(guidance?.items.map(i => i.code), ['gpc_choice_contradiction','qualified_collection_under_gpc','gpc_observation_availability']);
  assert.equal(guidance!.items[1]!.evidence[0]!.evidenceId,'product-0');
  assert.equal(guidance!.items[1]!.evidence[0]!.observedAtMs,500);
  assert.match(guidance!.items[0]!.observation,/site-recorded GPC receipt/);
  assert.equal(buildGpcGuidance(assessment,[])!.items.length,1,'neutral observation cannot create an adverse owner');
  const text = describeGpcGuidance(guidance!).join(' ');
  assert.match(text,/Initiator/);assert.match(text,/independent fresh GPC-off and GPC-on/);
  assert.doesNotMatch(text,/visitor-fixture|G-ABC123|gpp=|https:\/\/|fixture-loader|ent_|[?&]cid=/);
});

test("only the two retained propagation reasons produce propagation guidance; later CMP cannot corroborate earlier request", () => {
  const {assessment} = gpcProductFixture({priorCmpState:true, urls:[
    'https://securepubads.g.doubleclick.net/gampad/ads?gpp=DBAA&gpp_sid=8&us_privacy=1NYN',
    'https://securepubads.g.doubleclick.net/gampad/ads?gpp=&gpp_sid=&us_privacy=1NYN', QUALIFIED_URL,
  ]});
  assert.equal(assessment.observation.requests.gppPropagation?.rows.length,2,JSON.stringify(assessment.observation));
  const guidance = buildCanonicalGpcResponseProjection(findings(assessment))?.guidance;
  assert.deepEqual(guidance?.items.filter(i => i.kind === 'adverse' && i.findingId === 'gpp_propagation_inconsistency').map(i => i.code),['gpp_applicable_section_missing','gpp_empty_after_prior_state']);
  const empty = guidance!.items.find(i => i.code === 'gpp_empty_after_prior_state')!;
  assert.equal(empty.evidence[0]!.priorCmpObservedAtMs,100);
  const invalid = structuredClone(assessment);
  invalid.observation.requests.gppPropagation!.rows.find(r=>r.reason==='empty_gpp_after_observed_cmp_state')!.cmpEvidence!.observedAtMs = 900;
  assert.equal(gpcResponseAssessmentSchema.safeParse(invalid).success,false);
  const later = gpcProductFixture({urls:['https://securepubads.g.doubleclick.net/gampad/ads?gpp=&gpp_sid=&us_privacy=1NYN']});
  assert.ok(!buildCanonicalGpcResponseProjection(findings(later.assessment))?.guidance?.items.some(i=>i.code==='gpp_empty_after_prior_state'));
});

test("visible acknowledgment, analytics, unresolved activity and same-request restrictions do not become stronger diagnoses", () => {
  for (const url of [ANALYTICS_URL,UNRESOLVED_AD_URL,'https://www.googletagmanager.com/gtag/js?id=AW-123',QUALIFIED_URL+'&rdp=1']) {
    const {assessment} = gpcProductFixture({urls:[url]});
    const guidance = buildCanonicalGpcResponseProjection(findings(assessment))?.guidance;
    assert.ok(!guidance?.items.some(i=>i.kind==='adverse'),url);
  }
  const sibling = gpcProductFixture({urls:[QUALIFIED_URL+'&rdp=1',QUALIFIED_URL]});
  const collection = buildCanonicalGpcResponseProjection(findings(sibling.assessment))?.guidance?.items.find(i=>i.code==='qualified_collection_under_gpc');
  assert.deepEqual(collection?.evidence.map(e=>e.evidenceId),['product-1']);
  const visible = gpcProductFixture().assessment;
  visible.observation.acknowledgment.observed = true;
  visible.observation.registration.cmpGpcSignal='unknown';
  visible.observation.registration.sale='not_opted_out';
  assert.ok(!buildGpcGuidance(visible,findings(visible))?.items.some(i=>i.code==='gpc_choice_contradiction'));
});

test("semantic availability statuses remain distinct and never generate adverse guidance", () => {
  for (const semanticProbe of ['observed','unavailable','unsupported','not_ready','invalid','incomplete'] as const) {
    const a = gpcProductFixture().assessment;
    a.observation.semanticProbe=semanticProbe;
    if (semanticProbe !== 'observed') {a.observation.status='limited';a.observation.registration={...a.observation.registration,sale:'unknown',sharing:'unknown',cmpGpcSignal:'unknown'};}
    const guidance = buildGpcGuidance(a,findings(a));
    assert.equal(guidance?.items.length,1);
    const neutral = guidance!.items[0]!;
    assert.equal(neutral.kind,'neutral');assert.ok(!('findingId' in neutral));
    if(neutral.kind==='neutral')assert.equal(neutral.semanticProbe,semanticProbe);
  }
});

test("propagation guidance consumes the surfaced propagation owner's bound rows",()=>{
  const {assessment}=gpcProductFixture({urls:['https://securepubads.g.doubleclick.net/gampad/ads?gpp=DBAA&gpp_sid=8&us_privacy=1NYN']});
  const owners=findings(assessment),owner=owners.find(f=>f.unifiedFindingId==='gpp_propagation_inconsistency')!;
  assert.ok(owner?.details?.family==='privacy_signal');
  const unbound=structuredClone(owners);
  const modified=unbound.find(f=>f.unifiedFindingId==='gpp_propagation_inconsistency')!;
  if(modified.details?.family!=='privacy_signal'||modified.details.assessment.contractVersion!=='certscore.gpc-response-assessment.v3')throw Error('v3 required');
  modified.details.assessment.observation.requests.gppPropagation!.rows=[];
  assert.ok(!buildGpcGuidance(assessment,unbound)!.items.some(i=>i.kind==='adverse'&&i.findingId==='gpp_propagation_inconsistency'));
  const wrongScan=structuredClone(owners);
  const otherOwner=wrongScan.find(f=>f.unifiedFindingId==='gpp_propagation_inconsistency')!;
  if(otherOwner.details?.family!=='privacy_signal'||otherOwner.details.assessment.contractVersion!=='certscore.gpc-response-assessment.v3')throw Error('v3 required');
  otherOwner.details.assessment.observation.scanId='different-scan';
  assert.ok(!buildGpcGuidance(assessment,wrongScan)!.items.some(i=>i.kind==='adverse'&&i.findingId==='gpp_propagation_inconsistency'));
});
