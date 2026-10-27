import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  article13DisclosureRejectReason, classifyGdprTransparencyTopics,
  classifyPrivacySurface, type PolicySurfaceObservation,
} from "@certscore/contracts";
import {
  extractPolicySections, retainedPolicySectionsForObservation,
  retainedArticle13SectionEvidenceFromSections, extractPolicyFacts, policyFactsForFetchedDocument,
  assessGoverningPolicyBodyEvidence, assessPolicyDocumentSubstance,
  classifyPolicyDocumentOwnership, type PolicySurfaceCandidate,
} from "./scanners/policy-surface-scanner.js";
import fixture from "./test-fixtures/policy-transfer-witness-retained.json";

const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const normalize=(value:string)=>value.replace(/\s+/g," ").trim();
const modes=["scan_core","retained_report","multilingual_classifier"] as const;
const topic="international_transfers" as const;
const retained=fixture.retainedSections as PolicySurfaceObservation["retainedPolicySections"];
const reconstructed=extractPolicySections({html:"",sourceUrl:fixture.url,visibleText:fixture.text});
const selected=retainedArticle13SectionEvidenceFromSections([...retained,...reconstructed],fixture.url).find(e=>e.coverageArea===topic)!;

test("retained Tapmad security/SSL witness is rejected in all evidence modes",()=>{
  assert.ok(fixture.text.includes(fixture.securityWitness));
  for(const mode of modes) assert.notEqual(article13DisclosureRejectReason(fixture.securityWitness,topic,{mode}),null,mode);
  const security=retained.find(s=>s.heading==="Security, Kids, and Other Information")!;
  assert.notEqual(retainedArticle13SectionEvidenceFromSections([security],fixture.url).find(e=>e.coverageArea===topic)?.signalObserved,"observed");
});

test("retained cross-border statement is recognized without a country allowlist",()=>{
  assert.equal(fixture.text.slice(fixture.crossBorderOffset,fixture.crossBorderOffset+fixture.crossBorderParagraph.length),fixture.crossBorderParagraph);
  for(const mode of modes) assert.equal(article13DisclosureRejectReason(fixture.crossBorderParagraph,topic,{mode}),null,mode);
  const matches=classifyGdprTransparencyTopics({text:fixture.text}).matches.filter(m=>m.topic===topic);
  assert.ok(matches.length>0);
  assert.ok(matches.every(m=>fixture.text.includes(m.evidenceExcerpt)));
  // A reconstructed country substitution demonstrates the general clause rule,
  // never evidence about this alternate destination or a second real site.
  const alternate=fixture.crossBorderParagraph.replaceAll("Pakistan","Canada");
  assert.equal(article13DisclosureRejectReason(alternate,topic),null);
  assert.ok(classifyGdprTransparencyTopics({text:alternate}).matches.some(m=>m.topic===topic));
});

test("new witness comes from a source-bound window beyond the clipped section",()=>{
  assert.equal(hash(fixture.text),fixture.textSha256);
  assert.ok(!retained.some(s=>s.textExcerpt.includes(fixture.crossBorderParagraph)));
  assert.equal(selected.signalObserved,"observed");
  assert.equal(selected.sectionExtractionMethod,"canonical_topic_window");
  assert.equal(selected.sourceOffsetBasis,"normalized_visible_text");
  assert.equal(selected.selectedPolicySectionUrl,fixture.url);
  assert.equal(selected.sourceDocumentTextSha256,hash(normalize(fixture.text)));
  assert.ok(Number.isInteger(selected.sourceCharStart) && Number.isInteger(selected.sourceCharEnd));
  assert.ok(selected.sourceCharStart!>=0 && selected.sourceCharEnd!<=normalize(fixture.text).length);
  assert.equal(selected.evidenceTextSha256,hash(selected.selectedPolicySectionExcerpt));
  assert.ok(normalize(fixture.text).slice(selected.sourceCharStart,selected.sourceCharEnd).includes(selected.selectedPolicySectionExcerpt));
  assert.ok(fixture.crossBorderParagraph.includes(selected.selectedPolicySectionExcerpt));
  assert.match(selected.selectedPolicySectionExcerpt,/transferred to and processed in Pakistan/);
  assert.doesNotMatch(selected.selectedPolicySectionExcerpt,/SSL|non-disclosure agreements|billing transmission/);
  assert.ok(selected.selectedPolicySectionExcerpt.length<=640);
});

test("existing section and excerpt caps retain the better witness deterministically",()=>{
  assert.ok(reconstructed.length<=80);
  assert.ok(reconstructed.every(s=>s.textExcerpt.length<=1200));
  // Competing sections model the cap, not the unavailable historical inventory.
  const decoys=Array.from({length:32},(_,i)=>({...retained[0]!,heading:`Service providers ${i}`}));
  const bounded=retainedPolicySectionsForObservation([...decoys,...retained,...reconstructed]);
  assert.ok(bounded.length<=24);
  assert.ok(decoys.length+retained.length+reconstructed.length>24);
  const evidence=retainedArticle13SectionEvidenceFromSections(bounded,fixture.url).find(e=>e.coverageArea===topic)!;
  assert.equal(evidence.selectedPolicySectionExcerpt,selected.selectedPolicySectionExcerpt);
  assert.deepEqual(bounded,retainedPolicySectionsForObservation([...decoys,...retained,...reconstructed]));
});

test("merged compact evidence uses the actual transfer clause and rejects the old witness",()=>{
  const evidence=retainedArticle13SectionEvidenceFromSections([...retained,...reconstructed],fixture.url);
  const facts=policyFactsForFetchedDocument(extractPolicyFacts(fixture.text),evidence,{allowLegacyArticle13Extraction:true});
  const signal=facts.article13DisclosureSignals.find(s=>s.disclosureType===topic)!;
  assert.ok(signal);
  assert.equal(signal.selectedPolicySectionUrl,fixture.url);
  assert.ok(signal.evidenceText);
  assert.ok(fixture.crossBorderParagraph.includes(signal.evidenceText));
  assert.ok(signal.evidenceText.length<=640);
  assert.ok(facts.discardedArticle13DisclosureSignals.some(s=>s.disclosureType===topic));
});

test("existing Swappie EEA/SCC evidence remains usable in all modes",()=>{
  for(const mode of modes) assert.equal(article13DisclosureRejectReason(fixture.swappieControl.transferWitness,topic,{mode}),null,mode);
});

for(const [name,text] of [
  ["generic agreement","Our non-disclosure agreements require employees to protect personal data and financial information."],
  ["payment transmission","We encrypt credit card information with SSL for billing transmission to our payment provider."],
  ["domestic location only","Your personal information may be transferred to and processed in Canada for account administration."],
  ["financial transfer","Payments may be transferred to and processed in Canada, where privacy laws differ from the country where you reside."],
  ["unrelated geographic footer","Our agreements protect user data. Our office is in Canada. Visitors reside in other countries."],
  ["separate sentences","Your personal data may be transferred to and processed in Canada. The privacy laws differ in the country where you reside."],
  ["policy navigation","Home. Menu. Privacy Policy. International transfers. Contact us. Terms of Service. Overview."],
] as const) test(`nonqualifying ${name} does not establish international transfer evidence`,()=>{
  // English extraction/read-side paths. The multilingual validator expects
  // upstream locale classification; it is not a standalone English classifier.
  for(const mode of ["scan_core","retained_report"] as const) assert.notEqual(article13DisclosureRejectReason(text,topic,{mode}),null,mode);
  assert.ok(!classifyGdprTransparencyTopics({text}).matches.some(m=>m.topic===topic&&m.matchedTerm.includes("visitor's country")));
});

test("transfer recognition cannot supply target ownership or complete policy eligibility",()=>{
  const classification=classifyPrivacySurface({linkText:"Privacy Policy",url:fixture.url});
  const candidate:PolicySurfaceCandidate={candidateId:"reconstructed",url:fixture.url,normalizedUrl:fixture.url,linkText:"Privacy Policy",
    domLocation:"footer",sameOrigin:false,fetchable:true,clickable:true,observationOnly:false,mayLeadToConsentControls:false,
    discoveryMethod:"footer_link",deterministicSurfaceType:"privacy_policy",deterministicScore:classification.confidence,
    deterministicKeywordMatches:[],deterministicClassifierProvenance:"privacy_surface_classifier.v1",
    deterministicClassifierReasonCodes:classification.reasonCodes,deterministicMatchStrength:classification.matchStrength};
  const assessment={candidate,text:fixture.text,title:"Privacy Policy",documentTextChars:fixture.text.length,
    documentSubstance:assessPolicyDocumentSubstance({surfaceType:"privacy_policy" as const,text:fixture.text}),
    evidenceBoundObservedTopicCount:1,substantiveDisclosureSignalCount:1};
  for(const targetRelationship of ["unknown","service_provider","unrelated"] as const) {
    assert.notEqual(assessGoverningPolicyBodyEvidence({...assessment,targetRelationship,documentTextCoverageStatus:"complete"}).state,"substantive");
  }
  assert.notEqual(assessGoverningPolicyBodyEvidence({...assessment,targetRelationship:"target_controller",documentTextCoverageStatus:"partial"}).state,"substantive");
  for(const [vendor,url] of [["Google","https://policies.google.com/privacy"],["Cloudflare","https://www.cloudflare.com/privacypolicy/"],["Taboola","https://www.taboola.com/policies/privacy-policy"]]) {
    const ownership=classifyPolicyDocumentOwnership({documentUrl:url!,targetUrl:"https://publisher.example/",documentTitle:`${vendor} Privacy Policy`,
      directlyLinkedFromScannedPage:true,text:`${vendor} is the data controller. ${fixture.crossBorderParagraph}`});
    assert.ok(!["first_party_brand","target_controller"].includes(ownership.targetRelationship!));
  }
});
