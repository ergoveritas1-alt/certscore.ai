import assert from "node:assert/strict";
import test from "node:test";
import { contextualFindingSummary, contextualFindingTitle, isContextualReviewFinding } from "./assessment-finding-context";
import { selectRegulatoryReview } from "./regulatory-review-catalog";
import { buildAssessmentHighlightsPresentation } from "./assessment-highlights";
const http = {id:"regulatory_gap__gdpr_eprivacy__transport_security_http_redirect",title:"HTTP-to-HTTPS redirect review",rank:1,status:"Potential gap",summary:"The explicit HTTP-origin probe served a terminal HTTP 200 response over plaintext HTTP instead of redirecting to HTTPS.",correctionSteps:["Redirect the affected HTTP URLs to HTTPS."]};
const contrast = (impact: string) => ({id:"visual_contrast_accessibility_issue",title:"Text contrast and color cues",rank:2,status:"Observed",summary:"Links were not distinguishable from surrounding text without relying on color (1 element failure).",evidenceJson:{evidenceDetails:{accessibilityEvidence:{axeEvidence:[{ruleId:"link-in-text-block",impact,nodeCount:1,representativeNodes:[{selectors:["a.help"],htmlSnippet:"<a>Help</a>",failureSummary:"Link relies on color"}]}]}}}});

test("probe-only HTTP is contextualized without claiming verified browser protection or suppressing actual transport findings", () => {
  const exposure = {...http,id:"regulatory_gap__gdpr_eprivacy__transport_security_form_transport",summary:"The form submits over HTTP."};
  const source = [http,exposure]; const before=structuredClone(source);
  const result=selectRegulatoryReview(source,"gdpr_eprivacy");
  assert.equal(result.topIssues[0]?.id,exposure.id);
  assert.equal(result.reviewItemCount,1);
  assert.equal(result.topIssues.length,2);
  assert.deepEqual(source,before);
  const copy=buildAssessmentHighlightsPresentation([http],{kind:"page"});
  assert.match(copy.text,/probe served plaintext/);
  assert.match(copy.text,/does not establish browser exposure/);
  assert.match(copy.text,/protection was not assessed/);
  assert.doesNotMatch(copy.text,/browser is protected|unencrypted personal data/);
  const unrecognized="The check did not establish plaintext HTTP.";
  assert.equal(contextualFindingSummary(http,unrecognized),unrecognized);
});

test("contrast retains exact rule and prioritizes supported serious examples over low-impact or unspecified checks", () => {
  const serious=contrast("serious"), moderate=contrast("moderate");
  assert.equal(isContextualReviewFinding(serious),false);
  assert.equal(isContextualReviewFinding(moderate),true);
  assert.equal(isContextualReviewFinding({...serious,evidenceJson:{}}),true);
  assert.equal(contextualFindingTitle(serious,serious.title),"Links rely on color");
  const group={id:"accessibility_priority_group",evidenceJson:{findings:[serious]}};
  assert.equal(contextualFindingTitle(group,"Accessibility issues"),"Links rely on color");
  assert.match(contextualFindingSummary(group,"Review accessibility findings."),/link-in-text-block/);
  assert.match(contextualFindingSummary(serious,serious.summary),/link-in-text-block/);
  assert.equal(isContextualReviewFinding({id:"accessibility_priority_group",evidenceJson:{findings:[moderate,{id:"keyboard_navigation_accessibility_issue"}]}}),false);
  assert.equal(isContextualReviewFinding({id:"accessibility_priority_group",evidenceJson:{findings:[moderate]}}),true);
});
