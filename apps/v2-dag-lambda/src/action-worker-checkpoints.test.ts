import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { actionWorkerCheckpoints, retainedActionStage } from "./action-worker-checkpoints.js";

test("action failure diagnostics preserve ordered, bounded checkpoints across async dispatch", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "action-checkpoints-"));
  try {
    const checkpoint = actionWorkerCheckpoints(directory, "reject");
    await checkpoint("observation_started");
    void checkpoint("action_dispatched");
    await checkpoint("packet_validated");
    await checkpoint("artifact_upload_started");
    const record = JSON.parse(await readFile(path.join(directory, "V2ScanCorePhases.json"), "utf8"));
    assert.deepEqual(record.checkpoints.map((row: { name: string }) => row.name), [
      "reject:observation_started", "reject:action_dispatched", "reject:packet_validated", "reject:artifact_upload_started",
    ]);
    await checkpoint("artifact_upload_completed");
    await checkpoint("artifact_upload_started");
    assert.equal(JSON.parse(await readFile(path.join(directory, "V2ScanCorePhases.json"), "utf8")).checkpoints.length, 5);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("last action stage is allowlisted, bounded and preserves the interrupted operation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "action-stage-"));
  try {
    const checkpoint = actionWorkerCheckpoints(directory, "accept");
    await checkpoint("observation_started");
    await checkpoint.stage("storage_baseline");
    await checkpoint.stage("boundary_exhausted");
    await checkpoint.stage("finalization");
    await checkpoint.stage("cleanup");
    for (let i=0;i<100;i++) await checkpoint.stage("untrusted-url-or-cookie");
    const record=JSON.parse(await readFile(path.join(directory,"V2ScanCorePhases.json"),"utf8"));
    assert.equal(record.checkpoints.length,1);
    assert.equal(record.lastStage.name,"cleanup");
    assert.equal(record.interruptedStage.name,"storage_baseline");
    assert.ok(JSON.stringify(record).length<600);
  } finally { await rm(directory, {recursive:true,force:true}); }
});

test("failure stage projection excludes arbitrary strings, fields and invalid elapsed times",()=>{
  assert.deepEqual(retainedActionStage({name:"storage_baseline",elapsedMs:20000,secret:"not retained"}),{name:"storage_baseline",elapsedMs:20000});
  for(const value of [{name:"https://example.com/private",elapsedMs:1},{name:"cleanup",elapsedMs:NaN},{name:"cleanup",elapsedMs:-1},{name:"cleanup",elapsedMs:900001}]) assert.equal(retainedActionStage(value),undefined);
});
