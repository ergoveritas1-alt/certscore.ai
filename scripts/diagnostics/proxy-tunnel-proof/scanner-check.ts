import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preConsentRuntimeScanner } from '../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner';
import { createArtifactWriter } from '../../../packages/certscore-scan-core/src/artifact-writer';
import assert from 'node:assert/strict';
async function main(){
 process.env.CERTSCORE_PROXY_DESTINATION_ENABLED='1';
 process.env.SCAN_PROXY_ENABLED='1';
 process.env.SCAN_PROXY_SERVER='http://127.0.0.1:43128';
 process.env.CERTSCORE_PROXY_RECORDS_URL='http://127.0.0.1:43130/records';
 process.env.CERTSCORE_PROXY_RECORDS_KEY=(await readFile('/tmp/certscore-proxy-integration/key','utf8')).trim();
 const dir=await mkdtemp(join(tmpdir(),'certscore-core-check-'));
 try {
  const result=await preConsentRuntimeScanner({url:'https://ergoveritas.com/',normalizedUrl:'https://ergoveritas.com/',scanStartedAtMs:Date.now(),internalBudgetMs:15000,artifactWriter:await createArtifactWriter(dir),executionProfile:'inventory_only',captureScope:'runtime_evidence',screenshotMode:'never',stubHeavyResources:false});
  const destinations=result.networkEvents.filter(e=>e.networkDestination?.source==='proxy_connect_iplocate');
  const summary={errors:result.moduleRun.errors,status:result.moduleRun.status,requests:result.networkEvents.length,proxyDestinations:destinations.length,rows:destinations.map(e=>({host:e.hostname,...e.networkDestination}))};
  await writeFile('/tmp/certscore-core-proxy-check.json',JSON.stringify(summary,null,2));
  console.log(JSON.stringify({errors:summary.errors,status:summary.status,requests:summary.requests,proxyDestinations:summary.proxyDestinations}));
  assert(destinations.length>0,'Actual scanner must retain proxy-derived destinations');
 }finally{await rm(dir,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1});
