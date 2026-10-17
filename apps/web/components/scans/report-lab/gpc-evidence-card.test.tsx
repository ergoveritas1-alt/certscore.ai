import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {GpcEvidenceIndexCard} from "./shadow-scan-report";
import type {GpcResponseReportProjection} from "./shadow-report-data";

const projection = {
  assessment:{contractVersion:"certscore.gpc-response-assessment.v3",status:"indeterminate",
    observation:{status:"limited",registration:{sale:"unknown",sharing:"unknown"},requests:{count:20,complete:false,classifiedCount:13,collectionCount:5,advertisingCollectionCount:1}},
    comparison:{enabledProof:{secGpcHeaderValue:"1",navigatorGlobalPrivacyControl:true,requestsWithSecGpc:20}}},
  californiaDeductionPoints:15,
  observedFacts:[{label:"GPC signal",value:"Observed on the page request and in the browser"}],
  headline:"Observation limited",comparisonHeadline:"Comparison incomplete",coverageSummary:"The paired comparison did not meet the required evidence coverage.",evidenceRefs:[],summary:"Retained positive observation",
} as unknown as GpcResponseReportProjection;

test("GPC detail exposes verified facts without score deduction wording",()=>{
  const before=structuredClone(projection);
  const html=renderToStaticMarkup(<GpcEvidenceIndexCard projection={projection} california />);
  assert.match(html,/Risk observed/);
  assert.doesNotMatch(html,/deduct|15.point|penalt/i);
  assert.match(html,/13 classified tracking requests, including 5 collection requests/);
  assert.match(html,/Verified advertising collection: 1 request/);
  assert.match(html,/Capture was limited/);
  assert.match(html,/Observed on the page request and in the browser/);
  assert.doesNotMatch(html,/sale\/sharing setting could not be determined/);
  assert.doesNotMatch(html,/paired scan could not determine|Comparison with GPC disabled|Comparison incomplete|indeterminate/);
  assert.deepEqual(projection,before);
  const eu=renderToStaticMarkup(<GpcEvidenceIndexCard projection={projection} />);
  assert.doesNotMatch(eu,/15-point California risk deduction|15-point CA deduction/);
  assert.match(eu,/13 classified tracking requests/);
});
