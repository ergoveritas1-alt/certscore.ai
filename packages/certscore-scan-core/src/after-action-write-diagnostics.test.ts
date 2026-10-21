import assert from "node:assert/strict";
import test from "node:test";
import { afterActionWriteDiagnosticsSchema } from "@certscore/contracts";
import { afterActionWriteDiagnostics } from "./after-action-write-diagnostics";
const input={targetUrl:"https://example.test/",actionAtEpochMs:2000,observed:6,retained:4,nonEssentialObserved:2,nonEssentialRetained:2,unclassified:1,
 metadata:{observedLifetimeCount:106,ringEvictedCount:0,readbackOmittedCount:10,cookieHookHealthy:true,storageHookHealthy:true,documentUrl:"https://example.test/",documentTimeOriginMs:1000}};
test("after-click diagnostics preserve loss, hook health, scope and unknown metadata without upgrading evidence",()=>{
 const result=afterActionWriteDiagnostics(input);assert.ok(afterActionWriteDiagnosticsSchema.safeParse(result).success);
 assert.equal(result.diagnosticOnly,true);assert.equal(result.readbackOmittedCount,10);assert.equal(result.documentMatches,true);
 for(const metadata of [undefined,{...input.metadata,observedLifetimeCount:2}]) {
  const missing=afterActionWriteDiagnostics({...input,metadata});assert.equal(missing.probeAvailable,false);
  assert.equal(missing.observedLifetimeCount,null);assert.equal(missing.documentMatches,false);
  assert.ok(afterActionWriteDiagnosticsSchema.safeParse(missing).success);
 }
 assert.equal(afterActionWriteDiagnostics({...input,metadata:{...input.metadata,documentUrl:"https://elsewhere.test/"}}).documentMatches,false);
 assert.equal(afterActionWriteDiagnosticsSchema.safeParse({...result,windowRecordsRetained:7}).success,false);
});
