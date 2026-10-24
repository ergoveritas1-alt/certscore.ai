import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
import {classifyPrivacySurface} from "@certscore/contracts";
import {assessGoverningPolicyBodyEvidence, assessPolicyDocumentSubstance, assessPolicyDocumentRoleForChildSelection, type PolicySurfaceCandidate} from "./scanners/policy-surface-scanner";
import manifest from "./fixtures/policy-body-shell/manifest.json";

test("retained marketing and CMP shells cannot establish a complete governing privacy body", () => {
  for(const row of manifest.documents) {
    const bytes=readFileSync(new URL(`./fixtures/policy-body-shell/${row.fixture}`,import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"),row.sha256);
    const text=bytes.toString("utf8");
    const classification=classifyPrivacySurface({linkText:"Privacy Policy",url:row.url});
    const candidate={normalizedUrl:row.url,linkText:"Privacy Policy",deterministicSurfaceType:"privacy_policy",
      deterministicMatchStrength:classification.matchStrength,deterministicClassifierReasonCodes:classification.reasonCodes} as PolicySurfaceCandidate;
    const body=assessGoverningPolicyBodyEvidence({candidate,text,title:row.title,
      documentSubstance:assessPolicyDocumentSubstance({surfaceType:"privacy_policy",text,title:row.title,finalUrl:row.url}),
      documentTextChars:text.length,documentTextCoverageStatus:"complete",targetRelationship:"target_controller",
      evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0});
    assert.equal(body.state,"insufficient",row.url);
    assert.ok(body.reasonCodes.includes("policy_body_disclosure_evidence_unverified"));
    assert.equal(assessPolicyDocumentRoleForChildSelection(candidate,{fetchCandidates:[],observedChildCandidates:[]},
      {governingPolicyBodyAssessment:body,contentCoverageStatus:"complete",evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0}).role,"unknown");
  }
});

test("policy title and route alone cannot establish governing notice completeness", () => {
  for(const [title,text] of [["Website Privacy Notice","Navigation Products Resources Partners Contact "],
    ["Datenschutzerklärung","Navigation Produkte Ressourcen Partner Kontakt "]]) {
    const candidate={normalizedUrl:"https://example.test/website-privacy-notice",deterministicSurfaceType:"privacy_policy",
      deterministicClassifierReasonCodes:["matched_privacy_policy","context_satisfied","match_strength_direct"]} as PolicySurfaceCandidate;
    const body=assessGoverningPolicyBodyEvidence({candidate,text:text!.repeat(60),title,documentTextChars:4000,
      documentSubstance:{matchesExpectedSurface:true,reasonCode:"multilingual_policy_reviewable"},
      documentTextCoverageStatus:"complete",targetRelationship:"target_controller",evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0});
    assert.notEqual(body.state,"substantive");
  }
});

test("multilingual notice context remains reviewable without English disclosure matches", () => {
  const text="Polityka prywatności. Dane osobowe użytkownika i pliki cookies. Administrator przetwarza dane w celu świadczenia usług. ".repeat(35);
  const classification=classifyPrivacySurface({linkText:"Polityka prywatności",url:"https://example.test/prywatnosc"});
  const candidate={normalizedUrl:"https://example.test/prywatnosc",deterministicSurfaceType:"privacy_policy",
    deterministicMatchStrength:classification.matchStrength,deterministicClassifierReasonCodes:classification.reasonCodes} as PolicySurfaceCandidate;
  const body=assessGoverningPolicyBodyEvidence({candidate,text,title:"Polityka prywatności",
    documentSubstance:assessPolicyDocumentSubstance({surfaceType:"privacy_policy",text}),documentTextChars:text.length,
    documentTextCoverageStatus:"complete",targetRelationship:"target_controller",evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0});
  assert.equal(body.state,"substantive");
});

test("a corroborated substantive notice remains eligible when a preference center is also retained", () => {
  const text=("Privacy Policy. We collect personal data to provide our services. We retain personal data for six months. You have the right to access and delete your information. ").repeat(20)+
    " Privacy Preference Center. Reject all cookies. Allow all cookies. Manage consent preferences.";
  const classification=classifyPrivacySurface({linkText:"Privacy Policy",url:"https://example.test/privacy-policy"});
  const candidate={normalizedUrl:"https://example.test/privacy-policy",deterministicSurfaceType:"privacy_policy",
    deterministicMatchStrength:classification.matchStrength,deterministicClassifierReasonCodes:classification.reasonCodes} as PolicySurfaceCandidate;
  const body=assessGoverningPolicyBodyEvidence({candidate,text,title:"Privacy Policy",
    documentSubstance:assessPolicyDocumentSubstance({surfaceType:"privacy_policy",text}),documentTextChars:text.length,
    documentTextCoverageStatus:"complete",targetRelationship:"target_controller",evidenceBoundObservedTopicCount:2,substantiveDisclosureSignalCount:2});
  assert.equal(body.state,"substantive");
});
