import { buildApiV2PostureScores } from "../api-v2/posture-scores";
import assert from "node:assert/strict";
import test from "node:test";
import { SITE_INTEGRITY_POLICY_VERSION, LEGACY_SITE_INTEGRITY_POLICY_VERSION } from "@certscore/contracts";
import { siteIntegrityProjectionFixture } from "../../../../packages/certscore-contracts/src/site-integrity.fixture";
import { californiaCoverageFixture, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "../../server/scans/california-review-coverage.fixture";
import { projectCaliforniaPrivacyReview } from "../../server/scans/california-privacy-review-projection";
import { deriveCaliforniaRegulatoryScore } from "./california-regulatory-score";
import { deriveCanonicalOverallScoreExplanationForReport } from "../../server/scans/canonical-overall-score";
import { buildUnifiedFindingDisplayPackets, type UnifiedFindingDisplayPacket } from "./unified-findings";
import { siteIntegrityScoreDescription, siteIntegrityScoreEffectSchema, siteIntegrityPolicyForScoreVersion } from "./site-integrity-score-policy";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

const f = californiaCoverageFixture();
f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
f.bundle.policySurfaceObservations.forEach(surface => { surface.documentLanguage = "en"; });
const assessment = projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, CA_FIXTURE_URL, f.policyEvidence)!;
const checked = [{ id: "consent_surface_observed", assessmentStatus: "checked", evidenceState: "observed", status: "Observed",
  criticalEvidence: { retainedEvidence: { consentSurfaceObserved: true } } }] as unknown as GdprEprivacyCoverageChecklistItem[];
const ca = (findings: UnifiedFindingDisplayPacket[]) => deriveCaliforniaRegulatoryScore({ assessment, checklistRows: [], unifiedFindings: findings });
const eu = (findings: UnifiedFindingDisplayPacket[], version?: string) => deriveCanonicalOverallScoreExplanationForReport({
  scanRecord: { runtimeArtifacts: null, ...(version ? {snapshot:{score_version:version}} : {}) }, checklistRows: checked, unifiedFindings: findings });
function packets(count: number, version: string = SITE_INTEGRITY_POLICY_VERSION, pageId?: string) {
  const observation = { ...siteIntegrityProjectionFixture.observation, documentUrl: assessment.documentUrl,
    links: Array.from({length:count}, (_, i) => ({evidenceRef:`site_integrity:link:${i}`, destinationDomain:"promotion.example", concealment:"offscreen_position"})) };
  const projection = pageId ? { ...siteIntegrityProjectionFixture, scanId:assessment.scanId, contractVersion:"certscore.site-integrity-projection.v2",
    pageId, attemptId:"10000000-0000-4000-8000-000000000001", configurationHash:"c".repeat(64),
    evidenceRef:`full-site:${pageId}:10000000-0000-4000-8000-000000000001:evidence.json#siteIntegrityObservation`,
    observation:{...observation, contractVersion:"certscore.site-integrity-observation.v2", scope:"additional_page_main_document"} }
    : {...siteIntegrityProjectionFixture, scanId:assessment.scanId, observation};
  return buildUnifiedFindingDisplayPackets({runtimeArtifacts:{siteIntegrity:projection,siteIntegrityPolicyVersion:version},
    reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
}

test("both postures apply 13/18/23/28/33/37 to the same verified occurrences", () => {
  assert.equal(ca([]).score,100);
  for(const [count,points] of [[0,0],[1,13],[2,18],[3,23],[4,28],[5,33],[6,37],[7,37],[12,37]]) {
    const findings=packets(count!);
    const california=ca(findings),overall=eu(findings)!;
    assert.equal(california.score,100-points!);
    assert.equal(overall.score,100-points!);
    assert.equal(california.deductions.find(row=>row.policyKey==="site_integrity.hidden_outbound_links")?.points??0,points);
    assert.equal(overall.deductions.find(row=>row.family==="site_integrity")?.deductionPoints??0,points);
    const api=buildApiV2PostureScores({score:overall.score,californiaScore:california});
    assert.equal(api.gdprEprivacy.score,100-points!);
    assert.equal(api.ccpaCpra.score,100-points!);
    assert.equal(ca(JSON.parse(JSON.stringify(findings))).score,california.score);
    if(count)assert.equal(api.ccpaCpra.policyVersion,"california-regulatory-posture.v23-shared-integrity");
  }
});

test("repeated packets deduplicate; distinct occurrences on different pages share one cap in both targets", () => {
  const home=packets(1),other=packets(2,SITE_INTEGRITY_POLICY_VERSION,"20000000-0000-4000-8000-000000000001");
  for(const [findings,points] of [[[...home,...home],13],[[...home,...other,...other],23],[[...packets(6),...other],37]] as const) {
    assert.equal(ca(findings).score,100-points);
    assert.equal(eu(findings)?.score,100-points);
  }
});

test("historical v4 retains 17/22/27/32/37/40 and never gains a California effect", () => {
  for(const [count,points]of [[1,17],[2,22],[3,27],[4,32],[5,37],[6,40],[12,40]]) {
    const findings=packets(count!,LEGACY_SITE_INTEGRITY_POLICY_VERSION);
    assert.equal(findings[0]!.scoreEffects?.length,1);
    assert.equal(eu(findings,"overall-posture.v13")?.score,100-points!);
    assert.equal(eu(findings,"overall-posture.v13")?.scoreVersion,"overall-posture.v13");
    assert.equal(ca(findings).score,100);
  }
  assert.equal(siteIntegrityPolicyForScoreVersion("overall-posture.v13"),LEGACY_SITE_INTEGRITY_POLICY_VERSION);
  assert.equal(siteIntegrityPolicyForScoreVersion("overall-posture.v14-shared-integrity"),SITE_INTEGRITY_POLICY_VERSION);
});

test("unreportable, guessed and source-mismatched effects cannot create either deduction", () => {
  const original=packets(1)[0]!;
  const altered=[
    {...original,scoreEffects:original.scoreEffects!.map(effect=>({...effect,evidenceRefs:["guessed","source","hash"]}))},
    {...original,scoreEffects:original.scoreEffects!.map(effect=>({...effect,deductionPoints:37}))},
    {...original,presentationDecision:{...original.presentationDecision,status:"suppress"}},
    {...original,surfacingDecision:{...original.surfacingDecision,reportable:false}},
    {...original,details:original.details?.family==="site_integrity"?{...original.details,projection:{...original.details.projection,sourceHash:"d".repeat(64)}}:original.details},
  ] as UnifiedFindingDisplayPacket[];
  for(const finding of altered){assert.equal(ca([finding]).score,100);assert.equal(eu([finding])?.score,100);}
  const foreign=structuredClone(original);
  if(foreign.details?.family==="site_integrity")foreign.details.projection.scanId="unrelated-scan";
  assert.equal(ca([foreign]).score,100);
  const legacy=packets(1,LEGACY_SITE_INTEGRITY_POLICY_VERSION)[0]!.scoreEffects![0]!;
  assert.equal(siteIntegrityScoreEffectSchema.safeParse({...legacy,appliesTo:"california_posture"}).success,false);
  assert.doesNotMatch(siteIntegrityScoreDescription(original.scoreEffects!),/\d|point|deduct|cap|scor/i);
});
