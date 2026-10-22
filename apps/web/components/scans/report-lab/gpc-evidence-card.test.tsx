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

test("GPC detail groups qualifying recipients and shows retained request timing without deduction copy",()=>{
  const timed=structuredClone(projection);
  if(timed.assessment.contractVersion !== "certscore.gpc-response-assessment.v3")throw Error('v3 required');
  timed.assessment.observation.requests.advertisingCollectionRecipients={contractVersion:'canonical_collection_recipients.v1',resolverVersion:'fixture',rows:[
    {entityId:'ent_5262e317b747',label:'Adobe Inc.',evidenceId:'request-a',observedAtMs:1655},
    {entityId:'ent_5262e317b747',label:'Adobe Inc.',evidenceId:'request-b',observedAtMs:3200},
  ]};
  const html=renderToStaticMarkup(<GpcEvidenceIndexCard projection={timed} california />);
  assert.match(html,/Adobe Inc\./);assert.match(html,/2 collection requests/);
  assert.match(html,/1\.66/);assert.match(html,/3\.20/);assert.match(html,/after GPC visit start/);
  assert.equal((html.match(/Adobe Inc\./g)??[]).length,1);
  assert.doesNotMatch(html,/deduct|penalt|15.point/i);
  delete timed.assessment.observation.requests.advertisingCollectionRecipients.rows[0]!.observedAtMs;
  delete timed.assessment.observation.requests.advertisingCollectionRecipients.rows[1]!.observedAtMs;
  const legacy=renderToStaticMarkup(<GpcEvidenceIndexCard projection={timed} california />);
  assert.match(legacy,/Adobe Inc\./);assert.doesNotMatch(legacy,/after GPC visit start/);
});

test("GPC cards show recipient evidence without explaining applied or withheld deductions",()=>{
 for(const points of [0,15,25,47] as const){
  const candidate=structuredClone(projection);
  candidate.californiaDeductionPoints=points;
  if(candidate.assessment.contractVersion!=="certscore.gpc-response-assessment.v3")throw Error("v3 required");
  candidate.assessment.observation.requests.advertisingCollectionRecipients={contractVersion:"canonical_collection_recipients.v1",resolverVersion:"fixture",rows:[
   {entityId:"linkedin-fixture",label:"LinkedIn Corporation",evidenceId:"request-a",observedAtMs:1500},
  ]};
  const html=renderToStaticMarkup(<GpcEvidenceIndexCard projection={candidate} california />);
  assert.match(html,/LinkedIn Corporation/);
  assert.doesNotMatch(html,/deduct|scoring|score (?:effect|impact)|point (?:penalty|breakdown)|\d+.point/i);
 }
});

test("verified five-second activity remains visible when the independent quiet-page response is indeterminate",()=>{
 const measured=structuredClone(projection);
 measured.activityComparison={contractVersion:'certscore.gpc-activity-comparison.v1',evidencePolicy:'page_http_signal.v2',scanId:'fixture',status:'measured',scope:'matched_post_commit_request_window',durationMs:5000,
   sourceHashes:{baseline:'a'.repeat(64),gpc:'b'.repeat(64)},activity:{advertisingMarketing:{baselineRequests:24,gpcRequests:18,baselineServices:13,gpcServices:10},analyticsReplay:{baselineRequests:1,gpcRequests:1,baselineServices:1,gpcServices:1}},scoreEffect:'none',causedByGpc:'not_established'};
 measured.observedFacts.push({label:'5-second matched comparison',value:'Over the same 5-second interval after page commit, advertising/marketing requests: 24 without GPC and 18 with GPC; analytics/replay requests: 1 without GPC and 1 with GPC.'});
 const html=renderToStaticMarkup(<GpcEvidenceIndexCard projection={measured} california />);
 assert.match(html,/5-second/);assert.match(html,/24 without GPC and 18 with GPC/);
 assert.doesNotMatch(html,/Comparison incomplete|GPC is honored|deduct|penalt/i);
 assert.equal(measured.assessment.status,'indeterminate');
});

test("GPC request comparison sits directly in the GPC details before nested comparison evidence",()=>{
 const measured=structuredClone(projection);
 measured.activityComparison={contractVersion:'certscore.gpc-activity-comparison.v1',scanId:'fixture',status:'measured',scope:'matched_post_commit_request_window',durationMs:1000,
   sourceHashes:{baseline:'a'.repeat(64),gpc:'b'.repeat(64)},activity:{advertisingMarketing:{baselineRequests:1,gpcRequests:1,baselineServices:1,gpcServices:1},analyticsReplay:{baselineRequests:5,gpcRequests:5,baselineServices:1,gpcServices:1}},scoreEffect:'none',causedByGpc:'not_established'};
 measured.assessment.status='no_observable_response';
 measured.assessment.comparison.comparable=true;
 const before=structuredClone(measured);
 const html=renderToStaticMarkup(<GpcEvidenceIndexCard projection={measured} california />);
 assert.equal((html.match(/aria-label="Baseline versus GPC"/g)??[]).length,1);
 assert.ok(html.indexOf('aria-label="Baseline versus GPC"')<html.indexOf('Comparison with GPC disabled'));
 assert.match(html,/Requests observed during the first second after each page loaded\./);
 assert.match(html,/Advertising \/ marketing/);
 assert.match(html,/Analytics \/ session replay/);
 assert.deepEqual(measured,before);
});

test("GPC vendor evidence distinguishes identified activity and other retained requests without hiding either",()=>{
 const timed=structuredClone(projection);
 if(timed.assessment.contractVersion!=="certscore.gpc-response-assessment.v3")throw Error("v3");
 timed.assessment.observation.requests.advertisingCollectionRecipients={contractVersion:"canonical_collection_recipients.v1",resolverVersion:"fixture",rows:[
  {entityId:"ent_3ee0b5177739",label:"LinkedIn Corporation",evidenceId:"identified",observedAtMs:49},
  {entityId:"ent_3ee0b5177739",label:"LinkedIn Corporation",evidenceId:"other",observedAtMs:70},
 ]};
 timed.vendorFindings=[{entityId:"ent_3ee0b5177739",entity:"LinkedIn Corporation",requestCount:1,firstMs:49,evidenceIds:["identified"]}];
 const html=renderToStaticMarkup(<GpcEvidenceIndexCard projection={timed} california />);
 assert.match(html,/LinkedIn Corporation/);assert.match(html,/2 collection requests/);
 assert.match(html,/1 identified advertising, audience or synchronization request with GPC enabled/);
 assert.doesNotMatch(html,/deduction|penalt|points/i);
});
