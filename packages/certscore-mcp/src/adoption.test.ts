import assert from 'node:assert/strict';
import test from 'node:test';
import {PROJECT_REVIEW_INSTRUCTIONS, LIGHT_REVIEW_INSTRUCTIONS, EXAMPLE_SCAN_ID, comparisonPrompt, registerAdoptionFeatures} from './adoption.js';
test('adoption prompts use retained observations and avoid unsolicited scan work',()=>{
 assert.match(PROJECT_REVIEW_INSTRUCTIONS,/Never run unsolicited/);
 const prompt=comparisonPrompt('before','after');
 assert.match(prompt,/before and after/); assert.match(prompt,/do not start a new scan/);
 assert.match(prompt,/not proof of resolution/); assert.match(prompt,/coverage/);
});

test('Light discovery exposes only applicable resources and prompts with no origin reads', async () => {
  const prompts = new Map<string, any>(), resources = new Map<string, any>();
  const server = { registerPrompt: (name: string, meta: any, handler: any) => prompts.set(name, { meta, handler }), registerResource: (_name: string, uri: string, _meta: any, handler: any) => resources.set(uri, handler) };
  const unexpectedRead = async () => { throw new Error('Light discovery must not read the origin'); };
  registerAdoptionFeatures(server as any, unexpectedRead, unexpectedRead, { toolProfile: 'light' });
  assert.equal(prompts.size, 3);
  assert.deepEqual([...resources.keys()], ['certscore://project-instructions', 'certscore://example-report']);
  assert.equal(JSON.parse((await resources.get('certscore://project-instructions')()).contents[0].text), LIGHT_REVIEW_INSTRUCTIONS);
  const example = JSON.parse((await resources.get('certscore://example-report')()).contents[0].text);
  assert.equal(example.scanId, EXAMPLE_SCAN_ID);
  assert.deepEqual(example.nextAction, { tool: 'certscore_get_scan_bundle', arguments: { scanId: EXAMPLE_SCAN_ID } });
  assert.match(example.note, /do not create a replacement scan/);
  const compare = prompts.get('certscore_compare_scans').handler({ beforeScanId: EXAMPLE_SCAN_ID, afterScanId: '00000000-0000-4000-8000-000000000123' }).messages[0].content.text;
  const remediate = prompts.get('certscore_remediation_checklist').handler({ scanId: EXAMPLE_SCAN_ID }).messages[0].content.text;
  for (const text of [compare, remediate]) {
    assert.match(text, /certscore_get_report_evidence_page/);
    assert.doesNotMatch(text, /certscore_list_findings|certscore_explain_finding/);
    assert.match(text, /not (?:proof of resolution|invent findings)/);
  }
});
test('discovery registers three prompts and four resources; reads execute only on demand',async()=>{
 const prompts=new Map<string,any>(), resources=new Map<string,any>();let reads=0;
 const server={registerPrompt:(name:string,meta:any,handler:any)=>prompts.set(name,{meta,handler}),registerResource:(name:string,uri:string,meta:any,handler:any)=>resources.set(uri,handler)};
 registerAdoptionFeatures(server as any,async()=>{reads++;return {authenticated:true};},async()=>{reads++;return {example:true};});
 assert.equal(prompts.size,3);assert.equal(resources.size,4);assert.equal(reads,0);
 const result=await resources.get('certscore://connection')();
 assert.equal(JSON.parse(result.contents[0].text).authenticated,true);assert.equal(reads,1);
 const comparison=prompts.get('certscore_compare_scans');
 assert.equal(comparison.meta.argsSchema.beforeScanId.safeParse('bad').success,false);
});
