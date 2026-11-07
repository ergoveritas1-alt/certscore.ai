import assert from "node:assert/strict";
import test from "node:test";
import { buildReportDisplayExport } from "./report-display-export";

test("exports report content without internal diagnostic payloads and retains complete form fields", () => {
  const fields = Array.from({ length: 20 }, (_, i) => ({ name: `field${i}`, label: `Field ${i}`, required: false }));
  const result = buildReportDisplayExport({
    internalFutureField: { secret: true }, runtimeEvidenceGraph: { nodes: [1] },
    findings: [{ title: "Review", evidenceJson: "large raw packet", canonicalEvidenceJson: "another packet", evidenceRefs: ["proof"] }],
    fullSiteReport: { collectionSurfaces: { rows: [{ form: { fields }, snapshot: { status: "unavailable" } }] } },
  });
  const json = JSON.stringify(result);
  assert.ok(!json.includes("large raw packet"));
  assert.ok(!json.includes("another packet"));
  assert.ok(!json.includes("internalFutureField"));
  assert.ok(json.includes('"evidenceRefs":["proof"]'));
  assert.deepEqual((result as any).fullSiteReport.collectionSurfaces.rows[0].form.fields, fields);
});

test("repeated display records resolve to the original complete record", () => {
  const row = { key: "resource1", name: "retained display evidence ".repeat(40) };
  const result: any = buildReportDisplayExport({ resourceInventory: { resources: [row], services: [{ resources: [row] }] } });
  const ref = result.resourceInventory.services[0].resources[0].reportContentRef;
  assert.equal(ref, "/resourceInventory/resources/0");
  assert.deepEqual(result.resourceInventory.resources[0], row);
});

test("full-site export follows visible page and resource columns rather than internal crawl records", () => {
  const result: any = buildReportDisplayExport({ fullSiteReport: {
    pages: { total: 3, rows: [
      { id: 'visible', url: 'https://example.org', status: 'completed', cookies: 2, limitations: ['partial'], internalPacket: 'hidden', observation: { raw: 'hidden' } },
      { id: 'excluded', status: 'excluded' }, { id: 'cancelled', status: 'cancelled' },
    ] },
    resources: { total: 1, rows: [{ key: 'cookie', eventCount: 2, inventoryEvidence: 'Review', occurrence: { label: 'id', kind: 'cookie', firstSeenMs: 25, domain: 'example.org', details: { rawPayload: 'hidden', resourceRole: 'video_ad_sdk' }, identity: 'hidden' } }] },
    score: { value: 92, limitedPages: 1, evidencePages: [{ rows: [{ summary: 'Visible assessment' }] }], internalScoreInputs: 'hidden' },
  } });
  assert.equal(result.fullSiteReport.pages.total, 1);
  assert.deepEqual(result.fullSiteReport.pages.rows[0], { id: 'visible', url: 'https://example.org', status: 'completed', cookies: 2, limitations: ['partial'] });
  assert.equal(result.fullSiteReport.resources.rows[0].occurrence.firstSeenMs, 25);
  assert.equal(result.fullSiteReport.resources.rows[0].occurrence.resourceRole, 'video_ad_sdk');
  assert.equal(result.fullSiteReport.score.evidencePages[0].rows[0].summary, 'Visible assessment');
  assert.ok(!JSON.stringify(result).includes('hidden'));
});

test("nested repeated display records remain resolvable without duplicating their backing objects", () => {
  const row = { key: 'r', name: 'Visible resource '.repeat(50), occurrence: { label: 'Visible label '.repeat(50), kind: 'request' } };
  const result: any = buildReportDisplayExport({resourceInventory: {resources: [row], services: [{resources: [row]}]}});
  assert.equal(result.resourceInventory.services[0].resources[0].reportContentRef, '/resourceInventory/resources/0');
  assert.equal(result.resourceInventory.resources[0].occurrence.kind, 'request');
});

test("phase service references resolve inside their own inventory without exposing raw occurrences", () => {
  const inventory = (phase: string) => {
    const row = {key: `${phase}-resource`,name:`${phase} request`,eventCount:2,
      occurrence:{kind:'request',label:phase,firstSeenMs:50,identity:'private-identity',details:{rawPayload:'private-payload'}}};
    return {inventory:{resources:[row],services:[{name:phase,resources:[row]}]},scope:'retained_capture',clockLabel:phase};
  };
  const source = {resourceInventory:inventory('pre').inventory,actionInventories:{accept:inventory('accept'),reject:inventory('reject')}};
  const before=structuredClone(source),result:any=buildReportDisplayExport(source);
  for(const phase of ['accept','reject']){
    const ref=result.actionInventories[phase].inventory.services[0].resources[0].reportContentRef;
    assert.equal(ref,`/actionInventories/${phase}/inventory/resources/0`);
    const row=ref.slice(1).split('/').reduce((value:any,key:string)=>value[key],result);
    assert.equal(row.name,`${phase} request`);assert.equal(row.eventCount,2);
  }
  assert.ok(!JSON.stringify(result).includes('private-'));
  assert.deepEqual(source,before);
});

test("unverified GPC inventory cannot leak through report display or a GDPR view",()=>{
 const inventory={inventory:{resources:[{key:'gpc-secret-row'}],services:[]},scope:'retained_capture'};
 for(const report of [{reviewFocus:'gdpr_eprivacy',gpcResourceInventory:inventory},
   {reviewFocus:'ccpa_cpra',gpcResourceInventory:inventory,gpcResponse:{status:'indeterminate'}}]){
   assert.equal((buildReportDisplayExport(report) as any).gpcResourceInventory,undefined);
 }
});
