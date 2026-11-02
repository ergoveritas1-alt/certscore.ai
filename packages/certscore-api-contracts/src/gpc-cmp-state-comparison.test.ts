import test from "node:test";
import assert from "node:assert/strict";
import {gpcCmpStateComparisonSchema, readBoundGpcCmpStateComparison} from "./gpc-cmp-state-comparison";

test("standalone public packet enforces strict shape, bounds, section versions and bound source pair",async()=>{
  const {gpcCmpStateComparisonSchema:canonical}=await import("../../certscore-contracts/src/gpc-cmp-state-comparison");
  const {gpcProductFixture}=await import("../../../apps/web/lib/scans/test-fixtures/gpc-product");
  const {cmpStateComparison:p,assessment:a}=gpcProductFixture();assert.ok(p);
  assert.deepEqual(gpcCmpStateComparisonSchema.parse(p),canonical.parse(p));
  assert.deepEqual(readBoundGpcCmpStateComparison(p,a,a.observation.scanId),p);
  for(const bad of [
    {...p,rawGpp:'secret'}, {...p,sectionVersion:2}, {...p,sourceHashes:{baseline:p.sourceHashes.gpc,gpc:p.sourceHashes.gpc}},
    {...p,baseline:{...p.baseline,sale:'unknown'}}, {...p,gpc:{...p.gpc,observedAfterDocumentCommitMs:120001}},
    {...p,baseline:{...p.baseline,observedAfterDocumentCommitMs:-1}}, {...p,scoreEffect:'deduction'}, {...p,causedByGpc:'yes'},
  ])assert.equal(gpcCmpStateComparisonSchema.safeParse(bad).success,false,JSON.stringify(bad));
  for(const bad of [
    {...p,scanId:'foreign'}, {...p,sourceHashes:{...p.sourceHashes,baseline:'c'.repeat(64)}},
    {...p,sourceHashes:{...p.sourceHashes,gpc:'c'.repeat(64)}}, {...p,gpc:{...p.gpc,sale:'not_opted_out'}},
    {...p,gpc:{...p.gpc,observedAfterDocumentCommitMs:1001}},
    {...p,gpc:{...p.gpc,sharing:'not_opted_out'}}, {...p,gpc:{...p.gpc,received:'not_received'}},
  ])assert.equal(readBoundGpcCmpStateComparison(bad,a),undefined);
  assert.equal(readBoundGpcCmpStateComparison(p,a,'foreign'),undefined);
  for(const contractVersion of ['certscore.gpc-response-assessment.v1','certscore.gpc-response-assessment.v2'])
    assert.equal(readBoundGpcCmpStateComparison(p,{...a,contractVersion}),undefined);
  assert.equal(readBoundGpcCmpStateComparison(undefined,a),undefined);
});
