import assert from "node:assert/strict";
import test from "node:test";
import fixtures from "./__fixtures__/assessment-highlights-editorial-regressions.json";
import { buildAssessmentHighlightsPresentation, type AssessmentHighlightFinding } from "./assessment-highlights";
const page = {kind:"page"} as const;

test("historical Reject labels and grammar describe a click without claiming registered refusal",()=>{
  const source=fixtures.find(row=>row.domain==="achmea.nl")!;
  const saved=structuredClone(source);
  const result=buildAssessmentHighlightsPresentation(source.findings as AssessmentHighlightFinding[],page);
  const text=result.text+" "+(result.expanded?.text??"");
  assert.match(text,/Activity after a Reject click — review/);
  assert.match(text,/Partial evidence: 2 tracking requests began after the Reject control was clicked/);
  assert.doesNotMatch(text,/Post-choice tracking reduction|request\(s\)|Review the recorded requests|confirmed refusal|ignored Reject/);
  assert.deepEqual(source,saved);
});

test("a color-only link finding receives the non-color cue fix",()=>{
  const source=fixtures.find(row=>row.domain==="www.nih.gov")!;
  const result=buildAssessmentHighlightsPresentation(source.findings as AssessmentHighlightFinding[],page);
  assert.match(result.text,/persistent non-color cue, such as an underline/);
  assert.doesNotMatch(result.text,/Adjust the affected text and background colors/);
});

test("expanded copy balances settings qualifications with post-Reject observations",()=>{
  const source=fixtures.find(row=>row.domain==="www.fullstory.com")!;
  const result=buildAssessmentHighlightsPresentation(source.findings as AssessmentHighlightFinding[],page);
  assert.ok(result.expanded);
  assert.match(result.expanded.text,/Where refusal is as easy as acceptance, this need not be a compliance gap/);
  assert.match(result.expanded.text,/Reject/);
  const reject=source.findings.find(f=>f.id==="regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction")!;
  assert.ok(reject);
  assert.match(result.expanded.text,/after the Reject control was clicked|after Reject|after the Reject click/i);
  assert.ok(result.expanded.text.length<=1000);
  for(const link of result.links)assert.ok(result.expanded.links.some(other=>other.targetId===link.targetId));
});

test("unknown Reject qualifications remain whole after grammatical cleanup",()=>{
  const summary="Partial support from scan evidence; 1 tracking request(s) began after the Reject control was clicked. Decision registration was not verified; purpose remains unresolved.";
  const result=buildAssessmentHighlightsPresentation([{id:"regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction",title:"Post-choice tracking reduction",summary}],page);
  assert.match(result.text,/Partial evidence: 1 tracking request began/);
  assert.match(result.text,/Decision registration was not verified; purpose remains unresolved/);
});

test("critical priority and independent uncertainty survive sparse and crowded summaries",()=>{
  const findings:AssessmentHighlightFinding[]=[{id:"keyboard_navigation_accessibility_issue",title:"Keyboard trap",severity:"critical",summary:"A keyboard trap was reproduced in the tested dialog. Other journeys were not tested.",correctionSteps:["Correct focus entry and exit in the tested dialog, then retest using a keyboard."]},
    {id:"site_integrity_cms_security",title:"CMS review",severity:"low",summary:"The declared version needs verification; runtime version is unknown."}];
  const saved=structuredClone(findings);
  const result=buildAssessmentHighlightsPresentation(findings,{kind:"site",scannedPages:4});
  assert.match(result.text,/^“Keyboard trap”/);
  assert.match(result.text,/Other journeys were not tested/);
  assert.ok(result.text.length<=430);
  assert.deepEqual(findings,saved);
});
