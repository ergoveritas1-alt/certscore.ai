import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {documentFixture} from './lib/report-format-fixtures';
test('actual visual route rejects changed references before storage delivery or local fallback',async t=>{
 const mocks:Record<string,string>={state:'export const state={scan:null,deliveries:0,fallbacks:0};',next:'export class NextResponse extends Response {static json(body,init){return new Response(JSON.stringify(body),init)}static redirect(url,init){return new Response(null,{...init,status:307,headers:{...init?.headers,Location:url}})}}',
  record:"import {state} from 'fixture-state';export async function getPublicScanById(){return state.scan;}",
  local:"import {state} from 'fixture-state';export function getLocalV2DagReportInput(){state.fallbacks++;return null;}export async function resolveLocalV2DagVisualEvidencePointer(){throw Error('No artifact acquisition');}",
  delivery:"import {state} from 'fixture-state';export async function resolveVisualEvidenceDelivery(){state.deliveries++;return {kind:'object',object:{body:Buffer.from('owned-test'),contentType:'image/png'}}}",
 };
 const output=await build({stdin:{contents:"export {GET} from './apps/web/app/api/scans/[scanId]/visual-evidence/[artifactId]/route.ts';export {state} from 'fixture-state';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'local-only',setup(api){
  api.onResolve({filter:/.*/},a=>{const key=a.path==='fixture-state'?'state':a.path==='next/server'?'next':a.path.endsWith('/get-scan-by-id')?'record':a.path.endsWith('/local-v2-dag-report')?'local':a.path.endsWith('/visual-evidence-object')?'delivery':null;return key?{path:key,namespace:'fixture'}:undefined;});api.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}));
 }}]});
 const dir=await mkdtemp(join(tmpdir(),'certscore-visual-route-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'route.mjs');await writeFile(file,output.outputFiles[0]!.text);const {GET,state}=await import(pathToFileURL(file).href);
 const {scan,report}=documentFixture('gdpr_eprivacy');state.scan=scan;const href=report.visualReferences[0]!.href;
 const get=(url:string)=>GET(new Request(new URL(url,'https://certscore.ai')),{params:Promise.resolve({scanId:scan.scan.id,artifactId:'owned-image'})});
 assert.equal((await get(href)).status,200);assert.equal(state.deliveries,1);
 (scan.snapshot as Record<string,unknown>).report_projection_source_hash='f'.repeat(64);
 assert.equal((await get(href)).status,409);assert.equal(state.deliveries,1);assert.equal(state.fallbacks,0);
 assert.equal((await get(href.replace(/expectedReportSource=[a-f0-9]+/,'expectedReportSource='+'f'.repeat(64)))).status,200);
 state.scan.runtimeArtifacts.visualEvidenceArtifacts=[];assert.equal((await get(href)).status,409);assert.equal(state.fallbacks,0);
});
