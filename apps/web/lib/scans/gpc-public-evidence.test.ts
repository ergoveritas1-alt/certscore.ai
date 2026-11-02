import test from "node:test";
import assert from "node:assert/strict";
import {gpcResponseAssessmentSchema} from "@certscore/contracts";
import {deriveCaliforniaGpcResponsePolicy} from "./california-gpc-response-policy";
import {gpcProductFixture} from "./test-fixtures/gpc-product";
import {redactGpcProducerBindings} from "./gpc-public-evidence";

test("GPC public redaction preserves typed evidence, source receipts and policy effects without mutating internal proof",()=>{
  const {assessment}=gpcProductFixture({contradiction:true});
  const original=JSON.stringify(assessment),date=new Date('2026-11-01T00:00:00Z');
  const projected=redactGpcProducerBindings({date,nested:[{assessment}]});
  const safe=projected.nested[0]!.assessment;
  assert.doesNotMatch(JSON.stringify(safe),/fixture-loader|independent-baseline-loader|prototypeCaptureBinding|documentToken/);
  assert.match(original,/fixture-loader/);
  assert.equal(JSON.stringify(assessment),original);
  assert.equal(projected.date,date);
  assert.deepEqual(gpcResponseAssessmentSchema.parse(safe),safe);
  assert.deepEqual(safe.observation,assessment.observation);
  assert.deepEqual(safe.comparison.baselineArtifact,assessment.comparison.baselineArtifact);
  assert.deepEqual(safe.comparison.gpcArtifact,assessment.comparison.gpcArtifact);
  assert.deepEqual(deriveCaliforniaGpcResponsePolicy(safe),deriveCaliforniaGpcResponsePolicy(assessment));
  assert.deepEqual(redactGpcProducerBindings({legacy:true}),{legacy:true});
});
