import assert from "node:assert/strict";
import test from "node:test";
import fixtures from "./__fixtures__/assessment-highlights-edge-regressions.json";
import {assessmentHighlightFacts} from "./assessment-highlight-copy";
import {buildAssessmentHighlightsPresentation,type AssessmentHighlightFinding} from "./assessment-highlights";
import type {AssessmentScope} from "./assessment-brief";
const build=(domain:string)=>{
  const source=fixtures.find(row=>row.domain===domain)!;
  const before=structuredClone(source);
  const result=buildAssessmentHighlightsPresentation(source.findings as AssessmentHighlightFinding[],source.scope as AssessmentScope);
  assert.deepEqual(source,before);
  assert.ok(result.text.length<=500);
  assert.ok(!result.expanded||result.expanded.text.length<=1000);
  return result;
};

test("historical clipped qualifications are omitted whole instead of guessed or partially asserted",()=>{
  const result=build("www.geico.com");
  const all=result.text+" "+(result.expanded?.text??"");
  assert.doesNotMatch(all,/did not support a|\.\.\.|9 tracking requests began|purpose-specific.*deduction/);
  assert.ok(result.links.some(link=>link.targetId==="evidence-row-post_reject_tracking_reduction"));
  assert.deepEqual(assessmentHighlightFacts("Activity was observed. Its purpose was not...","unknown"),[]);
});

test("cookie disclosure and unconfirmed consent interfaces get applicable next steps",()=>{
  assert.match(build("kv.no").text,/Check which cookie disclosures apply; provide an accessible notice/);
  const consent=build("n8n.io").text;
  assert.match(consent,/could not confirm whether a consent interface was present/);
  assert.match(consent,/assessment was limited/);
  assert.match(consent,/Check whether optional services require consent/);
  assert.doesNotMatch(consent,/consent interface was absent|Review the retained checklist/);
});

test("sitewide storage and hidden links include corrections with necessary conditions",()=>{
  const storage=build("cnn.com").text;
  assert.match(storage,/15 non-essential/);
  assert.match(storage,/Check each retained item's purpose; defer confirmed non-essential storage/);
  const hidden=build("www.pferdeklinik-roentorf.de");
  assert.match(hidden.text,/remove unintended links or make intended navigation visible/);
  assert.match(hidden.text,/preserving legitimate skip links/);
  assert.match(hidden.expanded!.text,/declared, not runtime-confirmed/);
});

test("redirect review labels agree with the failed HTTP-to-HTTPS observation",()=>{
  const result=build("unrulymedia.com");
  assert.match(result.text,/“HTTP-to-HTTPS redirect review”/);
  assert.match(result.text,/plaintext HTTP instead of redirecting to HTTPS/);
  assert.match(result.text,/Redirect the affected HTTP URLs/);
});

test("three-member accessibility groups retain barriers and concrete fixes in collapsed copy",()=>{
  const result=build("linear.app");
  assert.match(result.text,/Scrollable regions lacked keyboard access/);
  assert.match(result.text,/Buttons lacked discernible accessible names/);
  assert.match(result.text,/Low-contrast text was detected/);
  assert.match(result.text,/enable keyboard access|Enable keyboard access/);
  assert.match(result.text,/name the flagged buttons and links/);
  assert.doesNotMatch(result.text,/Fix the flagged accessibility barriers/);
});
