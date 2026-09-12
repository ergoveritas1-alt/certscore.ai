import assert from 'node:assert/strict';
import test from 'node:test';
import { identifyCrawlService, describeCrawlService } from './full-site-resource-context';
import type { CrawlOccurrence } from '@website-signal-risk-scanner/shared';
const row = (url: string) => ({kind:'request',label:url,domain:new URL(url).hostname}) as CrawlOccurrence;
test('canonical product identity separates products owned by the same provider',()=>{
 const analytics=identifyCrawlService(row('https://www.google-analytics.com/g/collect'));
 const fonts=identifyCrawlService(row('https://fonts.googleapis.com/css2?family=Roboto'));
 assert.ok(analytics&&fonts); assert.notEqual(analytics.product,fonts.product);
 assert.equal(identifyCrawlService(row('https://unclassified.example/custom')),null);
});
test('policy lookup exposes scope/excerpt and requires complete coverage for a negative result',()=>{
 const identity=identifyCrawlService(row('https://www.google-analytics.com/g/collect'))!;
 const doc={url:'https://example.com/privacy',text:'We use Google Analytics to measure traffic.',sha256:'a'.repeat(64),complete:false,capturedAt:'2026-09-07'};
 const mentioned=describeCrawlService(identity,[doc]);assert.equal(mentioned.policy.status,'mentioned');assert.match(mentioned.policy.mentions[0]!.excerpt,/Google Analytics/);
 assert.equal(describeCrawlService(identity,[{...doc,text:'We describe our services.'}]).policy.status,'unknown');
 assert.equal(describeCrawlService(identity,[{...doc,text:'We describe our services.',complete:true}]).policy.status,'not_found');
 assert.equal(describeCrawlService(identity,[]).policy.status,'unknown');
 assert.equal(describeCrawlService(null,[{...doc,complete:true}]).policy.status,'unknown');
});

test('HQ enrichment uses exact provider identity and leaves policy and transfer conclusions unchanged',()=>{
 const identity=identifyCrawlService(row('https://api2.amplitude.com/2/httpapi'))!;
 const context=describeCrawlService(identity,[]);
 assert.equal(context.provider,'Amplitude, Inc.');
 assert.equal(context.headquarters,'US');
 assert.equal(context.transfer?.mechanism,'unknown');
 assert.equal(context.policy.status,'unknown');
 const regional=describeCrawlService({...identity,entity:'Google Ireland Limited'},[]);
 assert.equal(regional.provider,'Google Ireland Limited');
 assert.equal(regional.headquarters,null);
 assert.equal(regional.transfer,null);
});

test('single-page resources and services share verified policy lookup semantics', async () => {
 const { buildSinglePageResourceInventory } = await import('./single-page-resource-inventory');
 const request = { ...row('https://www.google-analytics.com/g/collect'), id:'request', identity:'request', eventCount:1, firstSeenMs:10, purpose:'analytics', relationship:'third_party', confidence:'0.99', assessment:'Not assessed', evidenceRefs:[], details:{}, resourceType:'script', serviceId:null, vendor:'Google' } as CrawlOccurrence;
 const document={url:'https://example.com/privacy',text:'We use Google Analytics to measure traffic.',sha256:'a'.repeat(64),complete:true,capturedAt:'2026-09-07'};
 for (const [documents, status] of [[[], 'unknown'], [[document], 'mentioned'], [[{...document,text:'We explain our practices.'}], 'not_found'], [[{...document,text:'We explain our practices.',complete:false}], 'unknown']] as const) {
   const inventory=buildSinglePageResourceInventory('scan',[],[request],[...documents]);
   assert.equal(inventory.resources[0]!.context.policy.status,status);
   assert.equal(inventory.services[0]!.context.policy.status,status);
   assert.equal(inventory.resources.length,1);
   assert.equal(inventory.resources[0]!.inventoryEvidence,'Non-essential');
   assert.equal('text' in (inventory.resources[0]!.context.policy.reviewed[0] ?? {}),false);
 }
});
