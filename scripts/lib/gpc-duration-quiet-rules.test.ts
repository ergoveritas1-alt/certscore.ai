import assert from "node:assert/strict";
import test from "node:test";
import type { GpcImpactCapture } from "../../packages/certscore-contracts/src";
import { durationNovelEvidenceOffsets, simulateDurationQuietRule } from "./gpc-duration-quiet-rules";

test("three-second quiet rule follows the proposed rolling deadline without looking past a stop", () => {
  assert.deepEqual(simulateDurationQuietRule([4000,6500],3000),{stopMs:9500,reachedCap:false});
  assert.equal(simulateDurationQuietRule([4000,6500],2000).stopMs,6000);
  assert.equal(simulateDurationQuietRule([6000],3000).stopMs,5000);
});
test("minimum, cap, half-open boundary and ordering are deterministic", () => {
  assert.equal(simulateDurationQuietRule([],2000).stopMs,5000);
  assert.equal(simulateDurationQuietRule([7000,4000,10000,12000,14000],3000).stopMs,7000);
  assert.deepEqual(simulateDurationQuietRule([4000,6000,8000,10000,12000,14000],3000),{stopMs:15000,reachedCap:true});
  assert.throws(()=>simulateDurationQuietRule([NaN],2000),/invalid_request_offset/);
});
test("background request starts can force the cap and a silent gap can hide later activity", () => {
  const polling = Array.from({length:15},(_,index)=>index*1000);
  assert.equal(simulateDurationQuietRule(polling,2000).stopMs,15000);
  assert.equal(simulateDurationQuietRule(polling,3000).stopMs,15000);
  assert.equal(simulateDurationQuietRule([1000,12000],3000).stopMs,5000);
  assert.equal(simulateDurationQuietRule([4000,6500],3000).stopMs,9500);
});
test("meaningful resets distinguish first service and first collection from aliases, repeats and unclassified requests", () => {
  type Row = NonNullable<GpcImpactCapture["requestLedger"]>["rows"][number];
  const row = (timestampMs: number, advertising: string[], collection: boolean): Row => ({eventId:String(timestampMs),timestampMs,advertising,analytics:[],collection,headersVerified:true,secGpc:null,urlSha256:"a".repeat(64),attributionUnknown:false});
  const index = new Map([["first",{key:"service",label:"Example"}],["alias",{key:"service",label:"Example"}]]);
  const rows = [row(200,["first"],false),row(2100,["alias"],false),row(4100,["first"],true),row(6100,["alias"],true),row(7000,[],false)];
  assert.deepEqual(durationNovelEvidenceOffsets(rows,100,index),[100,4000]);
  assert.equal(simulateDurationQuietRule(durationNovelEvidenceOffsets(rows,100,index),3000).stopMs,7000);
  assert.equal(simulateDurationQuietRule(rows.map(row=>row.timestampMs-100),3000).stopMs,9900);
  assert.throws(()=>durationNovelEvidenceOffsets([row(200,["missing"],false)],100,index),/unresolved_retained_service_identity/);
});
